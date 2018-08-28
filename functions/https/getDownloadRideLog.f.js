const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.
//[user includes]
const express = require('express');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();

app.use(cors);
app.use(cookieParser);

// GET /api/messages?category={category}
// Get all messages, optionally specifying a category to filter on
app.all('/', (req, res) => {
    console.log('Test called - body, params, query', req.body, req.params);
    const rideLogCollection = admin.firestore().collection('ride_log')

    rideLogCollection
        .get()
        .then(snapshots => {
            const logData = [];
            snapshots.forEach(doc => {
                if (doc.exists) {
                    console.log(doc.id, '=>', doc.data());
                    logData.push( {id: doc.id, data:doc.data()} )
                }
            });

            return res.json(logData);
        })
        .catch( err => {console.log('couldnt get driver info',err)})

});



exports = module.exports = functions.https.onRequest(app);