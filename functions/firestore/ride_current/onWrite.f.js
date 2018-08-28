const functions = require('firebase-functions'); // The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const admin = require('firebase-admin'); // The Firebase Admin SDK to access the Firebase Realtime Database.
try { admin.initializeApp(functions.config().firebase); } catch(e) { Function.prototype } // You do that because the admin SDK can only be initialized once.

// Listens for new data added to rides/{id}
exports = module.exports = functions.firestore.document('ride_current/{rideID}').onWrite((change, context) => {

    // get driver info from original
    const isDelete = !change.after.exists ? true : false
    const doc = change.after.exists ? change.after.data() : null;
    const oldDoc = change.before.data()
    const isNewDoc = (!change.before.exists && change.after.exists)

    const driver = isDelete ? oldDoc.driver : doc.driver
    const rideId = isDelete ? oldDoc.id : doc.id

    console.log('onCurrentRideWrite - isDelete?', isDelete, 'rideId', rideId, 'guardian', driver)

    if(!isNewDoc){
        return true
    }

    console.log('onCurrentRideWrite: isNewDoc ---> data',oldDoc, doc)

    // retrieve camera name from drivers{driver}
    admin.firestore().collection('drivers')
        .doc(driver[0].email)
        .get()
        .then( doc => {
            if ( !doc.exists ) {
                console.log(driver.email, 'driver not found')
                return
            }

            const driverCamera = doc.data().camera
            console.log('driver found,', doc.data(),' - rideId,',rideId, 'camera:',driverCamera)
            // set camera{name} to onRide = true
            admin.firestore().collection('camera')
                .doc(driverCamera)
                .set({
                    currRide: isDelete ? null : rideId,
                    onRide: isDelete ? false : true
                }, {merge: true})

            return true;
        })
        .catch(err => {console.log('Error getting driver',err)})

});

