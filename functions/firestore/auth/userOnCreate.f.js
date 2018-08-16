const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.

var mailgun = require('mailgun-js')({apiKey:'key-c21a941bb7663e3938b887a3cb502797', domain:'mg.scoopus.io'})

// Listens for new data added to contact_msgs{id}
exports = module.exports = functions.auth.user().onCreate((user) => {
    // Grab the current value of what was written to the firestore Database.
    console.log('Sending message', user);

    var data = {
        from: 'notify@scoopus.io',
        subject: `ScoopUs New Registration:: ${user.displayName}`,
        html: `<p>A new user has registerd at scoopus.io</p>
            <p>users can be viewed at <a href="https://console.firebase.google.com/u/1/project/yetigo-3b1de/authentication/users">the firebase console</a></p>
            <p>${JSON.stringify(user)}</p>`,
        to: 'customers@scoopus.io'
    }

    mailgun.messages().send(data, (error, body) => {
        console.log(body)
    })

    return 0;

});