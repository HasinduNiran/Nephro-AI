require("dotenv").config();
const mongoose = require("mongoose");

console.log("Attempting Mongoose connect()...");
console.log(`Using Mongoose Version: ${mongoose.version}`);

// Use the same options as server.js
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
};

mongoose.connect(process.env.DATABASE_URL, options)
    .then(() => {
        console.log("SUCCESS: Mongoose Connected!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("FAILURE: Mongoose Connection Error:");
        console.error(err);
        process.exit(1);
    });
