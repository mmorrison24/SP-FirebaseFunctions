const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try {admin.initializeApp(functions.config().firebase);} catch(e) {Function.prototype} // You do that because the admin SDK can only be initialized once.

// Listens for new data added to contact_msgs{id}
exports = module.exports = functions.firestore.document('rides/{rideID}').onCreate((snap, context) => {

    const original = snap.data(); // Grab the current value of what was written to the firestore Database.

    const driverIDPrms = getUserIdFromEmail(original.driver.email)
    const guardianIDPrms = getUserIdFromEmail(original.guardian.email)

    Promise.all([driverIDPrms, guardianIDPrms])
        .then((UIDs) => {
            let myUpdatedSnapshot = original
            myUpdatedSnapshot.driver.uid = UIDs[0];
            myUpdatedSnapshot.guardian.uid = UIDs[1];

            //console.log('myUpdatedSnapshot ', myUpdatedSnapshot, UIDs)

            return snap.ref.set(myUpdatedSnapshot, {merge: true})
        })
        .catch((err) => console.log('error',err))

});

const getUserIdFromEmail = (email) => {
    //console.log('going to check for ', email)
    if(email === null || email.length <= 0 || email === undefined){
        return null
    }

    return admin.auth().getUserByEmail(email)
        .then((userRecord) => { console.log('found:', userRecord); return userRecord.uid})
        .catch((error) => {console.log('error',error, email); return null})
}