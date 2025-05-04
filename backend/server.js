// backend/server.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = 4000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.path}`);
  next();
});

// --- API Endpoints ---
app.post('/api/token', async (req, res) => {
  try {
    const { code, redirect_uri /*, client_id, client_secret */ } = req.body; // We don't strictly need ID/Secret from body anymore

    // --- LOGGING (can keep or remove after fixing) ---
    console.log("--- Backend Received for Token Exchange ---");
    console.log("Received code:", code ? `${code.substring(0, 5)}...` : 'MISSING');
    console.log("Received redirect_uri:", redirect_uri);
    // Log what the backend WILL use from its environment
    console.log("Backend Using ENV REDDIT_CLIENT_ID:", process.env.REDDIT_CLIENT_ID ? `${process.env.REDDIT_CLIENT_ID.substring(0,5)}...` : 'MISSING_IN_ENV');
    console.log("Backend Using ENV REDDIT_CLIENT_SECRET:", process.env.REDDIT_CLIENT_SECRET ? 'PRESENT_IN_ENV' : 'MISSING_IN_ENV');
    console.log("-----------------------------------------");
    // --- END LOGGING ---

    if (!code || !redirect_uri) {
      console.error("Missing required parameters in request body (code, redirect_uri).");
      return res.status(400).json({
        error: "Token exchange failed",
        details: { message: "Missing required parameters (code, redirect_uri) in request." }
      });
    }
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
        console.error("Missing required REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET in backend environment.");
        return res.status(500).json({
            error: "Server configuration error",
            details: { message: "Backend is missing API credentials."}
        });
    }

    const formData = new URLSearchParams();
    formData.append('grant_type', 'authorization_code');
    formData.append('code', code);
    formData.append('redirect_uri', redirect_uri);

    console.log("Sending request to Reddit API using backend environment credentials...");

    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'web:reddit-saved-gallery:v1.0 (by /u/YourUsername)',
        },
        // *** Use environment variables for authentication ***
        auth: {
          username: process.env.REDDIT_CLIENT_ID,
          password: process.env.REDDIT_CLIENT_SECRET, // Use the actual secret from env
        },
      }
    );

    console.log("Reddit API response status:", response.status);
    console.log("Token exchange successful. Sending response to frontend.");
    res.json(response.data);

  } catch (error) {
    console.error('--- Error during Token Exchange with Reddit API ---');
    if (error.response) {
      console.error('Reddit Status:', error.response.status);
      console.error('Reddit Data:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status).json({
        error: 'Token exchange failed',
        details: error.response.data
      });
    } else if (error.request) {
      console.error('No response received from Reddit API:', error.request);
      return res.status(504).json({
        error: 'Token exchange failed',
        details: { message: 'No response received from Reddit API.' }
      });
    } else {
      console.error('Error setting up request to Reddit:', error.message);
      return res.status(500).json({
        error: 'Token exchange failed',
        details: { message: `Error setting up request: ${error.message}` }
      });
    }
  }
});

// --- Other endpoints (/api/me, /api/saved/:username, /status) remain the same ---

app.get('/api/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.warn("'/api/me' request missing token.");
      return res.status(401).json({ error: 'No token provided' });
    }

    console.log("Fetching user info from Reddit API...");
    const response = await axios.get('https://oauth.reddit.com/api/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'web:reddit-saved-gallery:v1.0 (by /u/YourUsername)'
      }
    });

    console.log("User info fetched successfully.");
    res.json(response.data);

  } catch (error) {
    console.error('--- Error Fetching User Info ---');
    if (error.response) {
      console.error('Reddit Status:', error.response.status);
      console.error('Reddit Data:', error.response.data);
      return res.status(error.response.status).json({
        error: 'Failed to get user info',
        details: error.response.data
      });
    }
     else {
        console.error('Error message:', error.message);
        return res.status(500).json({ error: 'Failed to get user info', details: { message: error.message } });
    }
  }
});

app.get('/api/saved/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { after } = req.query;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      console.warn("'/api/saved' request missing token.");
      return res.status(401).json({ error: 'No token provided' });
    }
    if (!username) {
        console.warn("'/api/saved' request missing username.");
        return res.status(400).json({ error: 'Username parameter is required' });
    }

    console.log(`Fetching saved posts for user: ${username}, after: ${after || 'start'}`);

    const response = await axios.get(`https://oauth.reddit.com/user/${username}/saved`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'web:reddit-saved-gallery:v1.0 (by /u/YourUsername)'
      },
      params: {
        limit: 50,
        after: after || null
      }
    });

    console.log(`Saved posts page fetched successfully (after: ${after || 'start'}).`);
    res.json(response.data);

  } catch (error) {
    console.error('--- Error Fetching Saved Posts ---');
     if (error.response) {
      console.error('Reddit Status:', error.response.status);
      console.error('Reddit Data:', error.response.data);
      return res.status(error.response.status).json({
        error: 'Failed to get saved posts',
        details: error.response.data
      });
    }
     else {
        console.error('Error message:', error.message);
        return res.status(500).json({ error: 'Failed to get saved posts', details: { message: error.message } });
    }
  }
});

app.get('/status', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Backend proxy server running on http://localhost:${PORT}`);
});
