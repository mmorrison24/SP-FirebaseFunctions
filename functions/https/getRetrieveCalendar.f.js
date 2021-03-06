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


// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.user`.

const authenticate = (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        res.status(403).send('Unauthorized');
        return;
    }
    let idToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        console.log('Found "Authorization" header');
        // Read the ID Token from the Authorization header.
        idToken = req.headers.authorization.split('Bearer ')[1];
    } else {
        console.log('Found "__session" cookie');
        // Read the ID Token from cookie.
        idToken = req.cookies.__session;
    }
    admin.auth().verifyIdToken(idToken).then((decodedIdToken) => {
        req.user = decodedIdToken;
        return next();
    }).catch(() => {
        res.status(403).send('Unauthorized');
    });
};

app.use(cors);
app.use(cookieParser);
app.use(authenticate);

// GET /api/messages?category={category}
// Get all messages, optionally specifying a category to filter on
app.get('/', (req, res) => {
    console.log('retrieve called - body, params, query', req.body, req.params, req.query.email,req.user.email);

    const emailCalendar = 'drivers@scoopus.io' // req.query.email;
    const emailOfInterest = req.user.email;

    calendar.events.list({
        calendarId: emailCalendar,
        //timeMin: (new Date()).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, resp) => {
        if (err) {
            console.log('The API returned an error: ' + err);
            return res.status(404);
        }
        if (resp.data.items.length <= 0) {
            console.log('No upcoming events found.');
            return res.status(200).json({events:[]});
        }

        const events = resp.data.items;
        let curated_events = [];

        console.log(`Returning upcoming ${events.length} events:`);
        events.map((event) => {
            const prunedEvent = pruneEvent(event);
            console.log('include?', (prunedEvent.guardian === emailOfInterest || prunedEvent.driver === emailOfInterest ))
            //console.log('names=', prunedEvent.guardian, emailOfInterest, prunedEvent.driver ,'\n')
            if(prunedEvent.guardian === emailOfInterest || prunedEvent.driver === emailOfInterest){
                curated_events.push(prunedEvent)
            }
        });

        // todo save the sanitized description back to the calendar
        //add to rides collection?
        addRidesToRideCollection(resp.data, resp.data.nextSyncToken)

        return res.status(200).json({events: curated_events});
    }), (err)=>{console.log(err)};

    //return res.status(200).json({test:true});

});

const addRidesToRideCollection = (ridesToUpload, nextSyncToken) => {
    // todo: remove this functinality , by performing at event creation
    ridesToUpload.map((event) => {
        const prunedEvent = pruneEvent(event);
        admin.firestore().collection('rides')
            .doc(prunedEvent.id)
            .set({
                id: prunedEvent.id,
                driver:{email:prunedEvent.driver},
                guardian: {email:prunedEvent.guardian},
                destination: prunedEvent.destination
            })
    });

    admin.firestore().collection('rides_sync')
        .doc("nextSyncToken")
        .set({
            token: nextSyncToken,
            date: (new Date()).toISOString()
        })

}

const getDriver = (text) => {
    if(text === undefined || text === null)
        return null
    const driverstr = text.match(/driver:.*/g)
    return driverstr && driverstr !== undefined ? driverstr[0].replace(/driver:/g,'') : null
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
    if(text === undefined || text === null)
        return null
    return text.replace(/(destination:.*)|(dest:.*)|(driver:.*)/gi,'')
}
const pruneEvent = (event) => {
    const startdate = event.start.dateTime || event.start.date;
    const enddate = event.end.dateTime || event.end.date;
    const {attendees, description, htmlLink, id, status, location, displayName, end, summary} = event;
    const driver = getDriver(description)
    const guardian = getGuardian(event.attendees, driver)
    const destination = getDestination(description)
    const cleanDescription = removeMetaData(description)
    console.log(summary, driver, guardian)
    return {
        description: cleanDescription,
        url: htmlLink,
        id,
        status,
        location,
        startdate,
        displayName,
        enddate,
        destination,
        summary,
        driver,
        guardian,
        attendees
    }

}
exports = module.exports = functions.https.onRequest(app);