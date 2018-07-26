const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try { admin.initializeApp(functions.config().firebase); } catch(e) { Function.prototype } // You do that because the admin SDK can only be initialized once.

// Listens for new data added to rides/{id}
exports = module.exports = functions.firestore.document('rides/{rideID}').onCreate((snap, context) => {

    const original = snap.data(); // Grab the current value of what was written to the firestore Database.

    let driverIDPrms = null
    let guardianIDPrms = null

    if(original.driver){
        driverIDPrms = getUserIdFromEmail(original.driver.email)
    }

    if(original.guardian) {
        guardianIDPrms = getUserIdFromEmail(original.guardian.email)
    }

    Promise.all([driverIDPrms, guardianIDPrms])
        .then( UIDs => {
            let myUpdatedSnapshot = original

            if (myUpdatedSnapshot === null)
                return

            myUpdatedSnapshot.driver = {};
            myUpdatedSnapshot.driver.uid = UIDs[0] || null;
            myUpdatedSnapshot.driver.email = original.driver.email;

            myUpdatedSnapshot.guardian = {};
            myUpdatedSnapshot.guardian.uid = UIDs[1] || null;
            myUpdatedSnapshot.guardian.email = original.guardian.email;

            //console.log('myUpdatedSnapshot ', myUpdatedSnapshot, UIDs)

            return snap.ref.set(myUpdatedSnapshot, {merge: true})
        })
        .catch( err => console.log('error',err))

});

const getUserIdFromEmail = (email) => {
    if(email === null || email === undefined || email.length <= 0 ){
        return null
    }
    //console.log('going to check for ', email)

    return admin.auth().getUserByEmail(email)
        .then((userRecord) => { console.log('found:', userRecord); return userRecord.uid})
        .catch((error) => {console.log('error',error, email); return null})
}