'use strict';
/** EXPORT ALL FUNCTIONS
 *
 *   Loads all `.f.js` files
 *   Exports a cloud function matching the file name
 *     https://github.com/firebase/functions-samples/issues/170
 *     https://codeburst.io/organizing-your-firebase-cloud-functions-67dc17b3b0da
 */
const glob = require("glob");
const camelCase = require("camelcase");
const files = glob.sync('./**/*.f.js', { cwd: __dirname, ignore: ['./node_modules/**','./utils/**']});

for(let f=0,fl=files.length; f<fl; f++){
    const file = files[f];
    const functionName = camelCase(file.slice(0, -5).split('/').join('_')); // Strip off '.f.js'
    console.log(functionName);
    if (!process.env.FUNCTION_NAME || process.env.FUNCTION_NAME === functionName) {
        exports[functionName] = require(file);
    }
}