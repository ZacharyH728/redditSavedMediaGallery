import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner'; // Ensure this component exists
import { useConfig } from '../ConfigContext.js';

// Other constants
const CLIENT_SECRET = ''; // Leave empty

function AuthCallback({ setToken }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const { config, loading, errorConfig } = useConfig();
  
  const [debug, setDebug] = useState({
    stage: 'starting',
    url: location.search,
    clientIDAvailable: false // Will be updated once config loads
  });

  useEffect(() => {
    // Don't proceed if config is still loading or has errors
    if (loading || errorConfig) {
      return;
    }

    // Get CLIENT_ID from config
    const CLIENT_ID = config.redditClientId;
    const REDIRECT_URI = config.redditCallback;
    // Update debug with CLIENT_ID status
    setDebug(prev => ({
      ...prev,
      clientIDAvailable: !!CLIENT_ID
    }));

    // Ensure Client ID is available
    if (!CLIENT_ID) {
      setError("Configuration Error: Missing Reddit Client ID.");
      setDebug(prev => ({ ...prev, stage: 'error', errorMessage: "Missing Client ID" }));
      return;
    }

    const processCallback = async () => {
      console.log("Processing callback, URL:", location.search);
      const urlParams = new URLSearchParams(location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const errorParam = urlParams.get('error'); // Check if Reddit returned an error

      // Check for errors returned by Reddit
      if (errorParam) {
        setError(`Reddit authorization error: ${errorParam}`);
        setDebug(prev => ({ ...prev, stage: 'error', errorMessage: `Reddit Error: ${errorParam}` }));
        return;
      }

      // Retrieve and verify the state parameter
      let storedState = null;
      try {
        storedState = localStorage.getItem('reddit_auth_state');
        // Optional: Remove state after retrieving it
        // localStorage.removeItem('reddit_auth_state');
      } catch (e) {
        console.error("Failed to read state from localStorage:", e);
        setError("Could not verify authentication state. Please try logging in again.");
        setDebug(prev => ({ ...prev, stage: 'error', errorMessage: "localStorage state read failed" }));
        return;
      }

      if (!state || !storedState || state !== storedState) {
        console.error('State mismatch - possible CSRF attack. Received:', state, 'Expected:', storedState);
        setError('Authentication failed. Invalid state parameter. Please try logging in again.');
        setDebug(prev => ({ ...prev, stage: 'error', errorMessage: "State mismatch" }));
        return;
      }

      // Ensure we received an authorization code
      if (!code) {
        setError("No authorization code received from Reddit. Please try logging in again.");
        setDebug(prev => ({ ...prev, stage: 'error', errorMessage: "No code received" }));
        return;
      }

      // Exchange the code for an access token via the backend proxy
      try {
        setDebug(prev => ({ ...prev, stage: 'token_exchange' }));
        console.log("Sending code to proxy server...");

        // Use the Docker service name 'backend' and port 4000
        const response = await axios.post('/api/token', {
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        });

        console.log("Proxy server response status:", response.status);
        console.log("Token data received:", response.data); // Log received data for debugging

        // Check for errors in the response data from the proxy/Reddit
        if (response.data.error) {
          throw new Error(`Token exchange error: ${response.data.error_description || response.data.error}`);
        }

        const accessToken = response.data.access_token;
        const refreshToken = response.data.refresh_token; // May be null depending on flow/duration

        // Ensure we got an access token
        if (!accessToken) {
          throw new Error("Access token not found in response.");
        }

        setDebug(prev => ({
          ...prev,
          stage: 'received_response',
          responseStatus: response.status,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken
        }));

        // Store the tokens securely (localStorage for simplicity here)
        try {
          localStorage.setItem('reddit_token', accessToken);
          if (refreshToken) {
            localStorage.setItem('reddit_refresh_token', refreshToken);
            console.log("Refresh token stored.");
          }
          console.log("Access token stored successfully.");
        } catch (e) {
          console.error("Failed to store tokens in localStorage:", e);
          // App can still function using the token in state for the current session
        }

        // Update the application state with the new token
        setToken(accessToken);

        // Redirect to the gallery page after successful authentication
        // Add a slight delay to ensure state updates propagate if needed
        setTimeout(() => {
          console.log("Redirecting to gallery...");
          navigate('/gallery');
        }, 100); // Shorter delay

      } catch (error) {
        console.error('Error during token exchange:', error);
        let errorMessage = 'Authentication failed during token exchange.';
        let errorDetails = {};

        if (error.response) {
          console.error('Error Response Status:', error.response.status);
          console.error('Error Response Data:', error.response.data);
          
          // Improved error message extraction
          const errorDesc = error.response.data?.error_description 
            || error.response.data?.error 
            || error.response.data?.message
            || 'Token exchange failed';
            
          errorMessage = `Error ${error.response.status}: ${errorDesc}`;
          errorDetails = error.response.data;
        } else if (error.request) {
          errorMessage = 'Network Error: Could not reach the authentication server. Please try again.';
        } else {
          errorMessage = `Authentication Error: ${error.message}`;
        }

        setDebug(prev => ({
          ...prev,
          stage: 'error',
          errorMessage,
          errorDetails,
          error: error.toString()
        }));
        setError(errorMessage);
      }
    };

    processCallback();
  }, [location, navigate, setToken, config, loading, errorConfig]); // Added config dependencies

  // Rendering logic
  if (loading) {
    return (
      <div className="auth-callback-container">
        <h2>Loading configuration...</h2>
        <LoadingSpinner />
        <div className="debug-info">
          <pre>{JSON.stringify({ stage: debug.stage }, null, 2)}</pre>
        </div>
      </div>
    );
  }

  if (errorConfig || error) {
    return (
      <div className="auth-error-container">
        <h2>Authentication Error</h2>
        <div className="error-message" style={{ whiteSpace: 'pre-wrap' }}>
          {errorConfig ? `Configuration Error: ${errorConfig.message}` : error}
        </div>
        <div className="debug-section">
          <h3>Debug Information</h3>
          <pre>{JSON.stringify({
            stage: debug.stage,
            error: error || errorConfig?.message,
            details: debug.errorDetails
          }, null, 2)}</pre>
        </div>
        <button onClick={() => navigate('/')}>Return to Login</button>
      </div>
    );
  }

  // Default loading state while processing
  return (
    <div className="auth-callback-container">
      <h2>Authenticating with Reddit...</h2>
      <LoadingSpinner />
      <p>Please wait while we complete the authentication process.</p>
      <div className="debug-info">
        <pre style={{ fontSize: '12px' }}>{JSON.stringify({ 
          stage: debug.stage,
          clientIDAvailable: debug.clientIDAvailable 
        }, null, 2)}</pre>
      </div>
    </div>
  );
}

export default AuthCallback;
