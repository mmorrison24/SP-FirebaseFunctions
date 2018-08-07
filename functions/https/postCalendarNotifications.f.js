const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.
//[user includes]
const {google} = require('googleapis');
const express = require('express');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const key = {
    "private_key": functions.config().googleapi.private_key.replace(/\\n/g,'\n'),
    "client_email": functions.config().googleapi.client_email,
}

// auth
const jwtClient = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    delegationEmail: 'yetigo-3b1de@appspot.gserviceaccount.com'
});
const auth = jwtClient

const calendar = google.calendar({version: 'v3', auth});

const root = {
    allDrivers: null,
    metaDataPromises: [], //use this
}

app.use(cors);
app.use(cookieParser);

// GET /api/messages?category={category}
// Get all messages, optionally specifying a category to filter on
app.all('/', (req, res) => {
    console.log('Calendar Update called');
    let syncToken = null

    admin.firestore().collection('rides_sync')
        .doc("nextSyncToken")
        .get()
        .then((doc) => {
            let syncToken = null
            if( doc.exists && doc.data() !== undefined && doc.data().token !== null )
                syncToken = doc.data().token

            readCalInfo(res, syncToken)
            return true
        }).catch(error => {
            console.log("Error getting syncToken:", error);
        });



});
const retrieveDrivers = () => {
    const driverCollection = admin.firestore().collection('drivers')

    return driverCollection
        .get()
        .then(snapshot => {
            const drivers = snapshot.map(doc => {
                if (!doc.exists) {
                    return null
                }
                const driver = {email: doc.id, uid:doc.data().uid};
                console.log('found driver', driver)
                return driver;
            });
            return drivers;
        })
        .catch( err => {console.log('couldnt get driver info',err)})
};

const readCalInfo = (res, syncToken) => {
    const emailCalendar = 'info@scoopus.io' // req.body.calendarID;

    // grab meta info
    const rtP = retrieveDrivers()
    console.log('creating rtP', rtP)
    root.metaDataPromises.push(rtP)
    root.allDrivers = rtP.then(data => {console.log('all drivers are downloaded', data);return data})
                    .catch(err => console.log('rtP',err))

    calendar.events.list({
        calendarId: emailCalendar,
        syncToken: syncToken,
        singleEvents: true,
    }, (err, resp) => {
        if (err) {
            console.log('The API returned an error: ' + err);
            return res.status(500);
        }
        if (resp.data.items.length <= 0) {
            console.log('No upcoming events found.');
            return res.status(200).json({events:[]});
        }

        // todo: handle updates and deletes properly

        const events = resp.data.items;
        let curated_events = [];
        console.log(`Sanitizing upcoming ${events.length} events:`);
        events.map((event) => {
            if(event.status === 'confirmed'){
                pruneEvent(event)
                    .then(perfectEvent=> {
                    // todo - do testing and logging here
                        console.log(`inside pruning event`);

                        if(perfectEvent) {
                        curated_events.push(perfectEvent)
                    }
                    return true
                }).catch( err => {console.log('couldnt prune event',err)})
            }
        });
        // todo save the sanitized description back to the calendar
        //add to rides collection?
        addRidesToRideCollection(curated_events, resp.data.nextSyncToken)

        return res.status(200).json(true); // todo - just return success
    }),
        (err)=>{
            console.log('error calendar.events.list',err)
            return res.status(504)
        };

    //return res.status(200).json({test:true});
}

const addRidesToRideCollection = (ridesToUpload, nextSyncToken) => {
    console.log('saving events', ridesToUpload.length)
    console.log('ride[0]', ridesToUpload[0])

    // todo: remove this function , by maybe? adding to batch at event creation

    const batch = admin.firestore().batch();
    const ridesRef = admin.firestore().collection('rides');

    ridesToUpload.map( event => {
        console.log('uploading event', event.id);
        batch.set( ridesRef.doc(event.id), event)
    });

    batch.commit()
        .then( data =>{
            console.log('save complete', data)
            return true;})
        .catch( err => {
            console.log('error occuried on save', err)
            return false
        })

    admin.firestore().collection('rides_sync')
        .doc("nextSyncToken")
        .set({
            token: nextSyncToken,
            date: new Date()
        })

}

const getDriverFromDescription = (text) => {
    if(text === undefined || text === null)
        return null
    const driverstr = text.match(/driver:.*/g)
    return driverstr && driverstr !== undefined ? driverstr[0].replace(/driver:/g,'') : null
}
const getDriverFromAttendees = attendees => {
    console.log('inside getDriverFromAttendees - root.allDrivers =', root.allDrivers)
    const attendeesEmails = attendees.map(attendee => attendee.email)

    return attendeesEmails.filter(email => {root.allDrivers.includes(email)})
}
const getGuardian = (attendees, driver_email) => {
    // todo utilize the driver collection in Firestore
    // todo make sure this returns multiple parents
    if(!attendees || attendees.length <= 0)
        return null

    const parents = attendees.filter((attendant) => !attendant.self && !attendant.organizer && attendant.email !== driver_email )
    return parents[0]? parents[0].email : null
}

const getDestination = (text) => {
    if(text === undefined || text === null)
        return null
    const dest = text.match(/(dest:.*)|(destination:.*)/g)
    return dest && dest !== undefined ? dest[0].replace(/(dest:)|(destination:)/g, '') : null
}
const removeMetaData = (text) => {
    return text && text !== undefined ? text.replace(/(destination:.*)|(dest:.*)|(driver:.*)/gi,'').replace(/<(?:.|\n)*?>/gm, '') : null
}
const pruneEvent = (event) => {
    console.log(`pruneEvent`);
    const {attendees, description, htmlLink, id, status, location, end, summary} = event;
    console.log(`pruneEvent2`);

    const startdate = event.start? event.start.dateTime || event.start.date : null;
    const enddate = event.start? event.end.dateTime || event.end.date : null;

    console.log(`pruneEvent3`);

    console.log(`pruneEvent4`);

    const destination = getDestination(description)

    console.log(`pruneEvent5`);
    const cleanDescription = removeMetaData(description)
    console.log(`pruneEvent6`);

    const drivers = getDriverFromAttendees(attendees)
    console.log(`pruneEvent7`);

    return Promise.all(root.metaDataPromises)
        .then(values => {
            console.log('inside promise.all', values)
            console.log('inside promise.all - metaDataP =', root.metaDataPromises)
            console.log('inside promise.all - drivers =', drivers)
            //tood: upgrade guardian to be a metaData function like the rest
            const guardian = { email: getGuardian(event.attendees, driver.email), id: null }
            let prunedEvent = {
                description: cleanDescription,
                url: htmlLink,
                id,
                status,
                location,
                startdate,
                enddate,
                destination,
                summary,
                driver: drivers !== undefined ? drivers : null,
                guardian,
                attendees
            }

            Object.keys(prunedEvent).map(key => (prunedEvent[key] === undefined ? prunedEvent[key] = null: true))

            return prunedEvent
        }).catch(err => {console.log('error in pruneEvent func', err); return null})


}
exports = module.exports = functions.https.onRequest(app);