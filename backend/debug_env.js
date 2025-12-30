require("dotenv").config();

const url = process.env.DATABASE_URL;

console.log("--- DEBUGGING DATABASE_URL ---");
if (!url) {
    console.log("ERROR: DATABASE_URL is undefined or empty.");
} else {
    console.log(`Length: ${url.length}`);
    // Mask password for security
    const maskedUrl = url.replace(/(:[^:@]+@)/, ':****@');
    console.log(`Loaded Value: '${maskedUrl}'`);
    
    // Check for whitespace
    if (url.trim() !== url) {
        console.log("WARNING: URL contains leading or trailing whitespace!");
    } else {
        console.log("Whitespace check passed.");
    }

    // Check for common issues
    if (url.includes('"') || url.includes("'")) {
         console.log("WARNING: URL contains quotes. Check if they are part of the value in .env");
    }
}
console.log("------------------------------");
