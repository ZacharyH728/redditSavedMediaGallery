import React, { useState } from 'react';
import './MediaItem.css';

function MediaItem({ post, viewMode, isSelected, onSelect, onDownload }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showInfo, setShowInfo] = useState(viewMode === 'feed');
  const [imageError, setImageError] = useState(false);
  
  const getMediaUrl = (post) => {
    if (post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return { type: 'image', url: post.url };
    }
    
    if (post.is_video && post.media && post.media.reddit_video) {
      return { type: 'video', url: post.media.reddit_video.fallback_url };
    }
    
    if (post.url.includes('redgifs.com') || 
        post.domain === 'redgifs.com' || 
        (post.preview && post.preview.reddit_video_preview)) {
      
      let redgifId = null;
      
      if (post.url.includes('/watch/')) {
        redgifId = post.url.split('/watch/')[1]?.split(/[?#]/)[0];
      } 
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
      
      return { type: 'link', provider: 'redgif', url: post.url };
    }
    
    if (post.url.includes('imgur.com') && !post.url.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return { type: 'image', url: `${post.url}.jpg` };
    }
    
    if (post.url.includes('gfycat.com')) {
      const gfycatId = post.url.split('/').pop().split('-')[0];
      return { type: 'video', url: `https://giant.gfycat.com/${gfycatId}.mp4` };
    }
    
    if (post.post_hint === 'image' || post.url.includes('i.redd.it')) {
      return { type: 'image', url: post.url };
    }
    
    if (post.preview && post.preview.images && post.preview.images[0]) {
      const preview = post.preview.images[0];
      if (preview.source) {
        return { type: 'image', url: preview.source.url.replace(/&amp;/g, '&') };
      }
    }
    
    if (post.thumbnail && post.thumbnail !== 'default' && post.thumbnail !== 'self') {
      return { type: 'image', url: post.thumbnail };
    }
    
    return { type: 'link', url: post.url };
  };
  
  const mediaInfo = getMediaUrl(post);
  
  const handleLoad = () => setLoaded(true);
  const handleError = () => {
    setError(true);
    setImageError(true);
  };
  
  const toggleInfo = () => {
    if (viewMode === 'grid') {
      setShowInfo(!showInfo);
    }
  };

  // Progressive image loading
  const ProgressiveImage = ({ src, alt }) => {
    const [currentSrc, setCurrentSrc] = useState(post.thumbnail || '');
    const [isLoading, setIsLoading] = useState(true);
    
    React.useEffect(() => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setCurrentSrc(src);
        setIsLoading(false);
        handleLoad();
      };
      img.onerror = handleError;
    }, [src]);
    
    return (
      <>
        {isLoading && <div className="media-loading">Loading...</div>}
        <img 
          src={currentSrc}
          alt={alt}
          className={`centered-media ${isLoading ? 'loading' : ''}`}
          style={{ filter: isLoading ? 'blur(5px)' : 'none' }}
        />
      </>
    );
  };

  const renderMedia = () => {
    if (error && imageError) {
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
          <ProgressiveImage 
            src={mediaInfo.url}
            alt={post.title}
          />
        );
      
      case 'video':
        return (
          <video 
            controls
            loop
            muted
            preload="metadata"
            onLoadedData={handleLoad}
            onError={handleError}
            src={mediaInfo.url}
            className="centered-media"
            onClick={(e) => e.stopPropagation()}
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
    <div className={`media-item ${viewMode} ${isSelected ? 'selected' : ''}`}>
      {viewMode === 'grid' && (
        <div className="selection-checkbox">
          <input 
            type="checkbox" 
            checked={isSelected} 
            onChange={onSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      
      <div className="media-content" onClick={toggleInfo}>
        {!loaded && !error && mediaInfo.type !== 'redgif' && mediaInfo.type !== 'link' && (
          <div className="media-loading">Loading...</div>
        )}
        
        {renderMedia()}
        
        {viewMode === 'feed' && (
          <div className="media-controls">
            <button 
              className="control-btn select-btn"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              aria-label={isSelected ? 'Deselect' : 'Select'}
            >
              {isSelected ? '☑' : '☐'}
            </button>
            <button 
              className="control-btn download-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              aria-label="Download"
            >
              ⬇
            </button>
          </div>
        )}
      </div>
      
      {showInfo && (
        <div className="media-info">
          <h3 className="post-title">{post.title}</h3>
          <div className="post-details">
            <span className="subreddit">r/{post.subreddit}</span>
            <span className="author">Posted by u/{post.author}</span>
          </div>
          <div className="post-actions">
            <a 
              href={`https://reddit.com${post.permalink}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="view-post-button"
              onClick={(e) => e.stopPropagation()}
            >
              View on Reddit
            </a>
            {viewMode === 'grid' && (
              <button 
                className="download-btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
              >
                Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaItem;
