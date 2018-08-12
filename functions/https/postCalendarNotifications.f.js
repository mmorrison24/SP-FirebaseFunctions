const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.

var _ = require('lodash');
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
            console.log('----> in driver then ', snapshot)
            let drivers = [];
            snapshot.forEach(doc => {
                if (!doc.exists) {
                    return null
                }
                // todo , grab the rest of the meta data in the driver obj
                const driver = {email: doc.id, uid:doc.data().uid};
                console.log('found driver', driver)
                drivers.push( driver );
            });
            console.log('after drivers setup', drivers)
            return Promise.resolve( drivers );
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

        //wait for meta data
        Promise.all(root.metaDataPromises)
            .then(metaData => {
                console.log(`Sanitizing upcoming ${events.length} events:`, metaData);
                events.map((event) => {
                    if(event.status === 'confirmed'){
                        curated_events.push( pruneEvent(event, metaData) )
                    }
                });
                // todo save the sanitized description back to the calendar
                //add to rides collection?
                console.log(`... going ot call addRidesToRideCollection`, curated_events);

                addRidesToRideCollection(curated_events, resp.data.nextSyncToken)

                return res.status(200).json(true); // todo - just return success
            }).catch(err => {console.log('error in pruneEvent func', err); return null})

    }), (err)=>{
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

const getDriverFromAttendees = ( attendees, drivers ) => {
    if(!attendees || attendees.length <= 0)
        return null

    const driverEmails = drivers.map( driver => (driver.email) );
    console.log('in egetDriverFromAttendees',driverEmails)
    return attendees.filter(member => (_.includes(driverEmails, member.email)))
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
const pruneEvent = (event, metaData) => {
    console.log(`pruneEvent ----------->>`);
    const {attendees, description, htmlLink, id, status, location, end, summary} = event;
    const startdate = event.start? event.start.dateTime || event.start.date : null;
    const enddate = event.start? event.end.dateTime || event.end.date : null;
    const destination = getDestination(description)
    const cleanDescription = removeMetaData(description)
    const driver = getDriverFromAttendees(attendees, metaData[0]);

    console.log(`pruneEvent2`, driver);
    //tood: upgrade guardian to be a metaData function like the rest
    const guardian = { email: getGuardian(event.attendees, driver? driver.email : null ), id: null }
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
        driver: driver !== undefined ? driver : null,
        guardian,
        attendees
    }

    Object.keys(prunedEvent).map(key => (prunedEvent[key] === undefined ? prunedEvent[key] = null: true))

    return prunedEvent
}

exports = module.exports = functions.https.onRequest(app);