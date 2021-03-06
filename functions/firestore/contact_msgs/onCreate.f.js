const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.

var mailgun = require('mailgun-js')({apiKey:'key-c21a941bb7663e3938b887a3cb502797', domain:'mg.scoopus.io'})

// Listens for new data added to contact_msgs{id}
exports = module.exports = functions.firestore.document('contact_msgs/{messageID}').onCreate((snap, context) => {
    // Grab the current value of what was written to the firestore Database.
    const original = snap.data();
    console.log('Sending message', original);

    var data = {
        from: 'notify@scoopus.io',
        subject: `ScoopUs Contact:: ${original.subject}`,
        html: `<p>${JSON.stringify(original.msg)}</p>`,
        'h:Reply-To': original.email,
        to: 'customers@scoopus.io'
    }

    mailgun.messages().send(data, (error, body) => {
        console.log(body)
    })

    return 0;

});