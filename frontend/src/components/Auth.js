import React from 'react';
import { v4 as uuidv4 } from 'uuid'; // Ensure you have 'uuid' installed: npm install uuid
import { useConfig } from '../ConfigContext';
// Reddit API credentials from environment variables
// Note: Create React App automatically includes variables prefixed with REACT_APP_

// Other constants
const SCOPES = ['history', 'identity', 'save']; // Include 'save' if needed for future features

function Auth() {
  const { config, loading, error } = useConfig();

  if (loading) {
    return <div>Loading configuration...</div>;
  }

  if (error) {
    return <div>Error loading configuration: {error.message}</div>;
  }

  // Now safely use the configuration
  const CLIENT_ID = config.redditClientId;
  const REDIRECT_URI = config.redditCallback;

  // Ensure required environment variables are set
  if (!CLIENT_ID) {
    console.error("Error: REDDIT_CLIENT_ID environment variable not set.");
    // Optionally, render an error message or prevent component rendering
  }

  const handleLogin = () => {
    // Check if Client ID is available before proceeding
    if (!CLIENT_ID) {
      alert("Configuration error: Reddit Client ID is missing. Please check environment variables.");
      return;
    }

    // Generate a random state string for CSRF protection
    const state = uuidv4();
    // Store the state in localStorage to verify it on callback
    try {
      localStorage.setItem('reddit_auth_state', state);
    } catch (e) {
      console.error("Failed to write to localStorage:", e);
      alert("Could not initiate login. Please ensure localStorage is enabled.");
      return;
    }

    // Build the authorization URL using environment variable
    const authUrl = `https://www.reddit.com/api/v1/authorize?`
      + `client_id=${encodeURIComponent(CLIENT_ID)}`
      + `&response_type=code`
      + `&state=${encodeURIComponent(state)}`
      + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
      + `&duration=permanent` // Request permanent access for refresh token
      + `&scope=${encodeURIComponent(SCOPES.join(' '))}`;

    console.log("Redirecting to Reddit for authorization:", authUrl);

    // Redirect the user to Reddit's authorization page
    window.location.href = authUrl;
  };

  return (
    <div className="auth-container">
      <h2>Reddit Saved Media Gallery</h2>
      <p>View all your saved Reddit posts with images, videos, and GIFs in one place.</p>
      {/* Display error if CLIENT_ID is missing */}
      {!CLIENT_ID && (
        <p style={{ color: 'red', fontWeight: 'bold' }}>
          Configuration Error: Missing Reddit Client ID.
        </p>
      )}
      <button className="login-button" onClick={handleLogin} disabled={!CLIENT_ID}>
        Sign in with Reddit
      </button>
    </div>
  );
}

export default Auth;
