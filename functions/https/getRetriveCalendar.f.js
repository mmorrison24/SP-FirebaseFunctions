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
app.get('*', (req, res) => {
console.log('retireve called');

    calendar.events.list({
        calendarId: 'drivers@yetigo.io',
        //timeMin: (new Date()).toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, resp) => {
        if (err) return console.log('The API returned an error: ' + err);
        const events = resp.data.items;
        if (events.length) {
            console.log(`Returning upcoming ${events.length} events:`);
            let curated_events = events.map((event, i) => {
                const startdate = event.start.dateTime || event.start.date;
                const enddate = event.end.dateTime || event.end.date;
                const {description, htmlLink, id, status, location, displayName, end, summary} = event;
                const prunedEvent = {
                    description,
                    url: htmlLink,
                    id,
                    status,
                    location,
                    startdate,
                    displayName,
                    enddate,
                    summary
                }
                console.log(`event: ${prunedEvent.displayName}\n`);
                return prunedEvent
            });

            return res.status(200).json({events: curated_events});
        } else {
            console.log('No upcoming events found.');
            return res.status(200).json({events:[]});
        }
    }), (err)=>{console.log(err)};

    //return res.status(200).json({test:true});

});

exports = module.exports = functions.https.onRequest(app);