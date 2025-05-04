import axios from 'axios';

// Reddit API credentials
const CLIENT_ID = 'dBRtI56wSSKD9QZpWXEtbQ';
const REDIRECT_URI = 'http://localhost:3000/auth-callback';
const RANDOM_STRING = 'random_string'; // Should be generated per session
const SCOPES = ['history', 'identity'];
const LIMIT = 100;

export const getAuthUrl = () => {
  return `https://www.reddit.com/api/v1/authorize?client_id=${CLIENT_ID}&response_type=code&state=${RANDOM_STRING}&redirect_uri=${REDIRECT_URI}&duration=temporary&scope=${SCOPES.join(' ')}`;
};

export const getAccessToken = async (code) => {
  try {
    const response = await axios.post(
      'https://www.reddit.com/api/v1/access_token',
      `grant_type=authorization_code&code=${code}&redirect_uri=${REDIRECT_URI}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: CLIENT_ID,
          password: '', // Client secret is not needed for installed apps
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
};

// Get user information
export const getUserInfo = async (token) => {
  try {
    const response = await axios.get('https://oauth.reddit.com/api/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'web:reddit-saved-gallery:v1.0'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching user info:', error);
    throw error;
  }
};

// Get saved posts
export const getSavedPosts = async (token, username, limit = LIMIT) => {
  try {
    const response = await axios.get(`https://oauth.reddit.com/user/${username}/saved`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'web:reddit-saved-gallery:v1.0'
      },
      params: {
        limit: limit
      }
    });
    
    // Extract posts from response and filter for media content
    const savedItems = response.data.data.children.map(child => child.data);
    
    // Filter for posts with media
    return savedItems.filter(post => {
      // Check if it's a submission (not a comment)
      if (!post.title) return false;
      
      // Check for various media types
      return (
        post.is_video ||
        post.post_hint === 'image' ||
        post.url.match(/\.(jpg|jpeg|png|gif)$/) ||
        post.url.includes('imgur.com') ||
        post.url.includes('gfycat.com') ||
        post.url.includes('redgifs.com') ||
        post.url.includes('i.redd.it')
      );
    });
  } catch (error) {
    console.error('Error fetching saved posts:', error);
    throw error;
  }
};

export const getMediaUrl = (post) => {
  // Handle direct image links
  if (post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
    return post.url;
  }
  
  // Handle Reddit videos
  if (post.is_video && post.media && post.media.reddit_video) {
    return post.media.reddit_video.fallback_url;
  }
  
  // Handle imgur links without extension
  if (post.url.includes('imgur.com') && !post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
    return `${post.url}.jpg`;
  }
  
  // Handle gfycat links
  if (post.url.includes('gfycat.com')) {
    const gfycatId = post.url.split('/').pop();
    return `https://thumbs.gfycat.com/${gfycatId}-size_restricted.gif`;
  }
  
  // Default case
  return post.thumbnail !== 'default' ? post.thumbnail : null;
};
