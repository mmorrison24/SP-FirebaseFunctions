const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.
//[user includes]
const {google} = require('googleapis');
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const app = express();


const key = {
    "private_key": functions.config().googlemap.key,
    "client_email": functions.config().googleapi.client_email,
}

app.use(cors);
app.use(cookieParser);

const root = {
    allDrivers: [],
    metaDataPromise: null, //use this
}

// GET /api/messages?category={category}
// Get all messages, optionally specifying a category to filter on
app.get('/', (req, res) => {
    console.log('onTripEstimate called - body, params, query', req.body, req.params, req.query);

    const dropoff = req.query.dropoff
    const pickup = req.query.pickup

    if(!dropoff || !pickup){
        return res.json({status: 'ERROR', error: 'destinations missing'})
    }
    // note https://developers.google.com/maps/documentation/directions/intro
    axios.get(`https://maps.googleapis.com/maps/api/directions/json?origin=${pickup}&destination=${dropoff}&key=${functions.config().googlemap.key}`) //&departure_time
        .then(function (response) {
            console.log(response)
            const data = response.data;
            if(data.status === 'OK'){
                console.log('onTripEstimate:response - data.status:',data.status);
                return res.json(data);
            } else {
                return res.json({status: 'ERROR', error: data.status})
            }

        })
        .catch(err => {console.log(err)})
});


exports = module.exports = functions.https.onRequest(app);