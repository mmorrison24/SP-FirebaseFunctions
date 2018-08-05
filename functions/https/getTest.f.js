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

app.use(cors);
app.use(cookieParser);

// GET /api/messages?category={category}
// Get all messages, optionally specifying a category to filter on
app.all('/', (req, res) => {
    console.log('calUpdate called - body, params, query', req.body, req.params);

    //dummy data
    attendees = [{email:'unkown@gmail.com'},{email:'testdriver@test.com'},{email:'info@scoopus.io'},{email:'auraisnu@gmail.com'}]

    const driverCollection = admin.firestore().collection('drivers')
    const attendeesEmails = attendees.map( attendee => attendee.email)

    console.log('attendeesEmails',attendeesEmails)


    console.log( 'return from func', getFirebaseData(driverCollection, attendeesEmails).then(results => {console.log('inside final thne',results.filter( r => r !== null)); return true;}) )


    function getFirebaseData(collection, key_arr) {
        return Promise
            .all(key_arr.map(key_str => collection.doc(key_str)
                .get()
                .then(doc => {
                    if (!doc.exists) {return( null)}
                    return( {email: doc.id, uid:doc.data().uid} )
                })))
    }



});

exports = module.exports = functions.https.onRequest(app);