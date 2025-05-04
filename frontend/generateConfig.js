const fs = require('fs');

// Get environment variables from container
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditCallback = process.env.REDDIT_CALLBACK_URL;
// Add any other environment variables you need
// const otherVariable = process.env.OTHER_VARIABLE || 'default_value';

// Create config object
const config = {
  redditClientId,
  redditCallback,
};

// Write to a file that will be served with your app
fs.writeFileSync('/usr/src/app/frontend/build/config.json', JSON.stringify(config));
console.log('Runtime configuration generated:', config);
