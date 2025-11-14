import React, { useState, useEffect } from 'react';
import './MediaItem.css';

function MediaItem({ post }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  // Get media URL based on post type
  const getMediaUrl = (post) => {
    if (!post) {
      return { type: 'error', url: null };
    }

    const postData = post;
    
    if (postData.url && postData.url.startsWith('/media/')) {
      const baseUrl = process.env.REACT_APP_BACKEND_URL || 
        (process.env.NODE_ENV === 'development' 
          ? 'http://localhost:4000'
          : window.location.origin); // Use window.location.origin instead of hardcoded URL
    
      try {
        // Encode the path portion of the URL
        const encodedPath = encodeURI(postData.url);
        const fullUrl = `${baseUrl}${encodedPath}`;
        console.log('Constructed URL:', fullUrl); // Add logging
        return { 
          type: 'image', 
          url: fullUrl
        };
      } catch (err) {
        console.error('Error constructing image URL:', err);
        return { type: 'error', url: null };
      }
    }
    
    // Default case - return error state
    return { type: 'error', url: null };
  };
  
  // Process the media information
  const mediaInfo = getMediaUrl(post);
  
  const handleLoad = () => {
    console.log('Image loaded successfully:', mediaInfo.url);
    setLoaded(true);
  };
  
  const handleError = (e) => {
    console.error('Error loading image:', {
      url: mediaInfo.url,
      error: e,
      post: post
    });
    setError(true);
  };
  
  const toggleInfo = () => {
    setShowInfo(!showInfo);
  };

  // Reset loaded and error states when media URL changes
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [mediaInfo.url]);

  // Early return if no valid post data or URL
  if (!post || !mediaInfo.url) {
    return (
      <div className="media-error">
        <p>Invalid media data</p>
      </div>
    );
  }

  return (
    <div className="media-item">
      <div className="media-content" onClick={toggleInfo}>
        {/* {!loaded && !error && (
          <div className="media-loading">Loading...</div>
        )} */}
        
        {error ? (
          <div className="media-error">
            <p>Error loading image</p>
            <small>{mediaInfo.url}</small>
            <button onClick={() => setError(false)}>Retry</button>
          </div>
        ) : (
          <img 
            src={mediaInfo.url}
            alt={post.title || 'Image'}
            onLoad={handleLoad}
            onError={handleError}
            className="centered-media"
          />
        )}
      </div>
      
      {showInfo && post 
      && (
        <div className="media-info">
          <h3 className="post-title">{post.title || 'Untitled'}</h3>
          {/* <div className="post-details">
            <span className="subreddit">{post.subreddit || 'Unknown Folder'}</span>
            <span className="author">Posted by {post.author || 'Unknown'}</span>
          </div> */}
        </div>
      )
      }
    </div>
  );
}

export default MediaItem;
