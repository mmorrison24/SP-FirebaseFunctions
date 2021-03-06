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
const retrieveProfiles = (collection) => {
    return collection
        .get()
        .then(snapshot => {
            let profiles = [];
            snapshot.forEach(doc => {
                if (!doc.exists) {
                    return null
                }
                const profile = _.assign( {email: doc.id}, doc.data() ); //todo - figure out how to rest operate this
                profiles.push( profile );
            });
            console.log('after profiles setup', profiles)
            return Promise.resolve( profiles );
        })
        .catch( err => {console.log('couldnt get driver info',err)})
};

const readCalInfo = (res, syncToken) => {


    // grab meta info
    const metaDataDriversPromise = retrieveProfiles(admin.firestore().collection('drivers'))
    const metaDataParentsPromise = retrieveProfiles(admin.firestore().collection('parents'))
    root.metaDataPromises.push(metaDataDriversPromise)
    root.metaDataPromises.push(metaDataParentsPromise)
    //wait for meta data
    Promise.all(root.metaDataPromises)
        .then(metaData => {

            parseCalendarList(res, syncToken,metaData)

            return true
        })
        .catch(err => {console.log('error in pruneEvent func', err); return null})
}

const parseCalendarList = (res, syncToken, metaData) => {

    const emailCalendar = 'info@scoopus.io' // req.body.calendarID;

    calendar.events.list({
        calendarId: emailCalendar,
        syncToken: syncToken,
        //singleEvents: true,
    }, (err, resp) => {
        console.log('-- parseCalendarList --',res, syncToken, metaData)
        if (err) {
            console.log('The API returned an error: ' + err);
            return res.status(500);
        }
        if (resp.data.items.length <= 0) {
            console.log('No More, upcoming events found.');
            addRidesToRideCollection(null, resp.data.nextSyncToken)
            return res.status(200).json(true)
        }

        // todo: handle updates and deletes properly

        const events = resp.data.items;
        let curated_events = [];


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

        parseCalendarList(res, resp.data.nextSyncToken, metaData)

        //return res.status(200).json(true); // todo - just return success


    }, (err)=>{
        console.log('error calendar.events.list',err)
        return res.status(504)
    });
}

const addRidesToRideCollection = (ridesToUpload, nextSyncToken) => {

    if(ridesToUpload){

        console.log('saving events', ridesToUpload.length)
        console.log('ride[last]', ridesToUpload[ridesToUpload.length-1])

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
    }

    if(nextSyncToken){
        admin.firestore().collection('rides_sync')
            .doc("nextSyncToken")
            .set({
                token: nextSyncToken,
                date: new Date()
            })
    }

}

const getDriverFromAttendees = ( attendees, drivers ) => {
    if(!attendees || attendees.length <= 0)
        return null

    const driverEmails = drivers.map( driver => (driver.email) );
    //console.log('in getDriverFromAttendees',driverEmails)
    const driver = attendees.filter(member => (_.includes(driverEmails, member.email)))
    console.log('drvr.',driver)
    return driver;
}
const getGuardianFromAttendees = ( attendees, guardians ) => {
    if(!attendees || attendees.length <= 0)
        return null

    const guardianEmails = guardians.map( guardian => (guardian.email) );
    //console.log('in egetGurdianFromAttendees', guardianEmails)
    const guardian = attendees.filter(member => (_.includes(guardianEmails, member.email)))
    console.log('guardian.',guardian)
    return guardian;
}
const getDestination = (text) => {
    if(text === undefined || text === null)
        return null
    const dest = text.match(/(d:.*)|(dest:.*)|(destination:.*)/gi)
    return dest ? dest[0].replace(/(d:)|(dest:)|(destination:)/gi, '') : null
}
const removeMetaData = (text) => {
    return text && text !== undefined ? text.replace(/(destination:.*)|(dest:.*)|(driver:.*)/gi,'').replace(/<(?:.|\n)*?>/gm, '') : null
}
const pruneEvent = (event, metaData) => {
    console.log(`pruneEvent ----------->>`, event.summary);
    const {attendees, description, htmlLink, id, status, location, end, summary, recurrence, recurringEventId} = event;
    const startdate = event.start? event.start.dateTime || event.start.date : null;
    const enddate = event.start? event.end.dateTime || event.end.date : null;
    const destination = getDestination(description);
    const cleanDescription = removeMetaData(description);
    const driver = getDriverFromAttendees(attendees, metaData[0]);
    const guardian = getGuardianFromAttendees(attendees, metaData[1]);

    /*console.log('guardian',guardian, summary)
    console.log('guardian',guardian, summary)*/
    console.log(`pruneEvent2`, driver, summary);
    //tood: upgrade guardian to be a metaData function like the rest
    let prunedEvent = {
        description: cleanDescription,
        url: htmlLink,
        currentStep:'null',
        id,
        status,
        location,
        startdate,
        enddate,
        destination,
        summary,
        recurrence: recurrence ? recurrence : null,
        recurringEventId: recurringEventId ? recurringEventId : null,
        driver: driver ? driver : null,
        driver_flat: driver? driver.map(d => (d.email)) : null,
        guardian: guardian? guardian : null,
        guardian_flat: guardian? guardian.map(g => (g.email)) : null,
        attendees
    }
    console.log(`pruneEvent3 <----`, summary, prunedEvent.driver_flat, prunedEvent.guardian_flat);

    Object.keys(prunedEvent).map(key => (prunedEvent[key] === undefined ? prunedEvent[key] = null: true))

    return prunedEvent
}

exports = module.exports = functions.https.onRequest(app);