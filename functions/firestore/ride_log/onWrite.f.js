const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try { admin.initializeApp(functions.config().firebase); } catch(e) { Function.prototype } // You do that because the admin SDK can only be initialized once.

var mailgun = require('mailgun-js')({apiKey:'key-c21a941bb7663e3938b887a3cb502797', domain:'mg.scoopus.io'})

// Listens for new data added to rides/{id}
exports = module.exports = functions.firestore.document('ride_log/{rideID}').onWrite((change, context) => {

    const original = change.before.data(); // Grab the current value of what was written to the firestore Database.

    // get driver info from original
    const isDelete = ( !change.after.exists )
    if(isDelete) {
        return true
    }

    const doc = change.after.exists ? change.after.data() : null;
    const oldDoc = change.before.data()

    const guardian_flat = isDelete ? oldDoc.guardian_flat : doc.guardian_flat
    const rideId = isDelete ? oldDoc.id : doc.id
    const current_step = isDelete ? oldDoc.current_step : doc.current_step
    const summary = isDelete ? oldDoc.summary : doc.summary

    console.log('onRide_LogWrite - current_step', current_step, 'rideId', rideId, 'guardian', guardian_flat)
    console.log(' ---> data',oldDoc, doc)

    let msg = '';
    let title = '';
    //create message based on current_step
    if(current_step === 'nav_to_pickup') {
        title = 'Ready For Pickup'
        msg = 'Your transporter is arriving and is ready to .'
    }
    if(current_step === 'dropoff') {
        title = 'Arrived'
        msg = 'Your transporter has arrived at the dropoff location, and is escorting your child as noted in the ride.'
    }

    //send email to guardians
    guardian_flat.map(email => {
        var data = {
            from: 'notify@scoopus.io',
            subject: `ScoopUs Ride Update:: ${summary} - ${title}`,
            html: `<p>${JSON.stringify(msg)}</p>`,
            'h:Reply-To': email,
            to: 'customers@scoopus.io'
        }
        /*
            mailgun.messages().send(data, (error, body) => {
                console.log(body)
            })*/
    })

});

