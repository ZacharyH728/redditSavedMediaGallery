const fs = require('fs');

// Get environment variables from container
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditCallback = process.env.REDDIT_CALLBACK_URL;
// const node_env = process.env.NODE_ENV;
// Add any other environment variables you need
// const otherVariable = process.env.OTHER_VARIABLE || 'default_value';

// Create config object
const config = {
  redditClientId,
  redditCallback,
  apiUrl: process.env.REACT_APP_API_URL
};

// Write to a file that will be served with your app
fs.writeFileSync('/usr/src/app/frontend/build/config.json', JSON.stringify(config));
console.log('Runtime configuration generated:', config);
