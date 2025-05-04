import React, { useState } from 'react';
import './MediaItem.css';

function MediaItem({ post }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  
  // Get media URL based on post type
  const getMediaUrl = (post) => {
    // Handle direct image links
    if (post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return { type: 'image', url: post.url };
    }
    
    // Handle Reddit videos
    if (post.is_video && post.media && post.media.reddit_video) {
      return { type: 'video', url: post.media.reddit_video.fallback_url };
    }
    
    // Handle redgifs - various patterns
    if (post.url.includes('redgifs.com') || 
        post.domain === 'redgifs.com' || 
        (post.preview && post.preview.reddit_video_preview)) {
      
      // Extract redgif ID
      let redgifId = null;
      
      // Pattern: redgifs.com/watch/[id]
      if (post.url.includes('/watch/')) {
        redgifId = post.url.split('/watch/')[1]?.split(/[?#]/)[0];
      } 
      // Pattern: redgifs.com/[id]
      else if (post.url.match(/redgifs\.com\/\w+/)) {
        redgifId = post.url.split('redgifs.com/')[1]?.split(/[?#]/)[0];
      }
      
      if (redgifId) {
        return { 
          type: 'redgif', 
          id: redgifId,
          url: `https://redgifs.com/watch/${redgifId}`
        };
      }
      
      // Fallback: return the URL for direct opening
      return { type: 'link', provider: 'redgif', url: post.url };
    }
    
    // Handle imgur links without extension
    if (post.url.includes('imgur.com') && !post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return { type: 'image', url: `${post.url}.jpg` };
    }
    
    // Handle gfycat links
    if (post.url.includes('gfycat.com')) {
      const gfycatId = post.url.split('/').pop().split('-')[0];
      // First try the mp4 version
      return { type: 'video', url: `https://giant.gfycat.com/${gfycatId}.mp4` };
    }
    
    // If we can detect it's an image post
    if (post.post_hint === 'image' || post.url.includes('i.redd.it')) {
      return { type: 'image', url: post.url };
    }
    
    // Default case - check if preview available
    if (post.preview && post.preview.images && post.preview.images[0]) {
      const preview = post.preview.images[0];
      if (preview.source) {
        return { type: 'image', url: preview.source.url.replace(/&amp;/g, '&') };
      }
    }
    
    // Last resort - use thumbnail
    if (post.thumbnail && post.thumbnail !== 'default' && post.thumbnail !== 'self') {
      return { type: 'image', url: post.thumbnail };
    }
    
    // Nothing worked, return link
    return { type: 'link', url: post.url };
  };
  
  // Process the media information
  const mediaInfo = getMediaUrl(post);
  
  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);
  
  // Toggle info panel when clicking on media
  const toggleInfo = () => {
    setShowInfo(!showInfo);
  };

  // Render different content based on media type
  const renderMedia = () => {
    if (error) {
      return (
        <div className="media-error">
          <p>Failed to load media</p>
          <a href={mediaInfo.url} target="_blank" rel="noopener noreferrer" className="original-link">
            Open original
          </a>
        </div>
      );
    }
    
    switch (mediaInfo.type) {
      case 'image':
        return (
          <img 
            src={mediaInfo.url}
            alt={post.title}
            onLoad={handleLoad}
            onError={handleError}
            className="centered-media"
          />
        );
      
      case 'video':
        return (
          <video 
            controls
            loop
            muted
            onLoadedData={handleLoad}
            onError={handleError}
            src={mediaInfo.url}
            className="centered-media"
            onClick={(e) => e.stopPropagation()} // Prevent video controls from toggling info
          />
        );
      
      case 'redgif':
        return (
          <div className="redgif-embed-container">
            <iframe 
              src={`https://redgifs.com/ifr/${mediaInfo.id}`}
              frameBorder="0" 
              scrolling="no" 
              width="100%" 
              height="100%" 
              allowFullScreen
              title={`Redgif - ${mediaInfo.id}`}
            ></iframe>
          </div>
        );
      
      case 'link':
      default:
        return (
          <div className="media-link">
            <p>This content cannot be displayed directly</p>
            <a href={mediaInfo.url} target="_blank" rel="noopener noreferrer" className="original-link">
              Open original content
            </a>
            {post.thumbnail && post.thumbnail !== 'default' && post.thumbnail !== 'self' && (
              <img 
                src={post.thumbnail}
                alt="Thumbnail"
                className="content-thumbnail"
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="media-item">
      <div className="media-content" onClick={toggleInfo}>
        {!loaded && !error && mediaInfo.type !== 'redgif' && mediaInfo.type !== 'link' && (
          <div className="media-loading">Loading...</div>
        )}
        
        {renderMedia()}
      </div>
      
      {showInfo && (
        <div className="media-info">
          <h3 className="post-title">{post.title}</h3>
          <div className="post-details">
            <span className="subreddit">r/{post.subreddit}</span>
            <span className="author">Posted by u/{post.author}</span>
          </div>
          <a 
            href={`https://reddit.com${post.permalink}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="view-post-button"
          >
            View on Reddit
          </a>
        </div>
      )}
    </div>
  );
}

export default MediaItem;
