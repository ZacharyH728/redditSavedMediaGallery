// Configuration store
export const config = {
  redditClientId: import.meta.env.VITE_REDDIT_CLIENT_ID || '',
  redditCallback: import.meta.env.VITE_URL_REDDIT_CALLBACK || '/auth-callback',
  apiUrl: import.meta.env.VITE_API_URL || 'https://reddit.zhill.me/api',
};

// Validate configuration
if (!config.apiUrl) {
  console.warn('Warning: API URL is missing from environment variables');
} else {
  console.log('API URL:', config.apiUrl);
}

if (!config.redditClientId) {
  console.warn('Warning: Reddit Client ID is missing from environment variables');
}

if (!config.redditCallback) {
  console.warn('Warning: Reddit Callback URL is missing from environment variables');
}
