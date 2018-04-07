const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.

var mailgun = require('mailgun-js')({apiKey:'key-c21a941bb7663e3938b887a3cb502797', domain:'mg.yetigo.io'})

// Listens for new data added to contact_msgs{id}
exports = module.exports = functions.firestore.document('contact_msgs/{messageID}').onWrite((event) => {
    // Grab the current value of what was written to the firestore Database.
    const original = event.data.data();
    console.log('Sending message', original);

    // only trigger for new messages [event.data.previous.exists()]
    // do not trigger on delete [!event.data.exists()]
    if (!event.data.exists || event.data.previous.data()) {
        console.log('exiting at !event.data.exists || event.data.previous.data()',!event.data.exists , event.data.previous.data())
        return
    }

    var data = {
        from: 'notify@yetigo.io',
        subject: `YetiGo Contact:: ${original.subject}`,
        html: `<p>${JSON.stringify(original.msg)}</p>`,
        'h:Reply-To': original.email,
        to: 'customers@yetigo.io'
    }

    mailgun.messages().send(data, function (error, body) {
        console.log(body)
    })

    return 0;

});