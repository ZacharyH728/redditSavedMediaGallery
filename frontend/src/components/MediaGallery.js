import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import MediaItem from './MediaItem';
import LoadingSpinner from './LoadingSpinner';
import './MediaGallery.css';

function MediaGallery({
  token,
  username,
  setOriginalPosts,
  currentPosts,
  isLoadingInitialPosts,
  setIsLoadingInitialPosts,
  isLoadingOrderChange,
  viewMode,
  selectedPosts,
  onSelectPost,
  collections,
  onDownload
}) {
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const [error, setError] = useState(null);
  const [after, setAfter] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  const processPosts = (children) => {
    if (!Array.isArray(children)) return [];
    return children
      .map(child => child.data)
      .filter(post => {
        if (!post || !post.title) return false;
        return (
          post.is_video ||
          post.post_hint === 'image' ||
          post.url.match(/\.(jpg|jpeg|png|gif)$/i) ||
          post.url.includes('imgur.com') ||
          post.url.includes('gfycat.com') ||
          post.url.includes('redgifs.com') ||
          post.url.includes('i.redd.it')
        );
      });
  };

  const fetchNextPage = useCallback(async () => {
    if (loadingNextPage || !hasMorePosts || !username || !token) return;

    setLoadingNextPage(true);
    setError(null);
    console.log(`MediaGallery: Fetching next page for ${username}, after: ${after}`);

    try {
      const savedResponse = await axios.get(
        `http://192.168.1.164:4000/api/saved/${username}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { after: after }
        }
      );

      const newChildren = savedResponse.data?.data?.children || [];
      const newAfter = savedResponse.data?.data?.after;
      const newPosts = processPosts(newChildren);

      console.log(`MediaGallery: Fetched ${newPosts.length} new media posts. Next 'after': ${newAfter}`);

      if (newPosts.length > 0) {
        setOriginalPosts(prev => [...prev, ...newPosts]);
      }

      setAfter(newAfter);
      setHasMorePosts(!!newAfter && newChildren.length > 0);

    } catch (err) {
      console.error('MediaGallery: Error fetching next page:', err);
      setError(`Failed to load more posts: ${err.response?.data?.error || err.message}`);
      setHasMorePosts(false);
    } finally {
      setLoadingNextPage(false);
    }
  }, [loadingNextPage, hasMorePosts, after, username, token, setOriginalPosts]);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!token || !username || !isLoadingInitialPosts) {
        if (!token && !username) setIsLoadingInitialPosts(false);
        return;
      }

      console.log(`MediaGallery: Starting initial fetch for ${username}...`);
      setLoadingNextPage(true);
      setError(null);
      setAfter(null);
      setHasMorePosts(true);

      try {
        const savedResponse = await axios.get(
          `http://192.168.1.164:4000/api/saved/${username}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { after: null }
          }
        );

        const initialChildren = savedResponse.data?.data?.children || [];
        const initialAfter = savedResponse.data?.data?.after;
        const initialPosts = processPosts(initialChildren);

        console.log(`MediaGallery: Initial fetch found ${initialPosts.length} posts. Next 'after': ${initialAfter}`);

        setOriginalPosts(initialPosts);
        setAfter(initialAfter);
        setHasMorePosts(!!initialAfter && initialChildren.length > 0);

      } catch (err) {
        console.error('MediaGallery: Error fetching initial data:', err);
        setError(`Failed to load initial posts: ${err.response?.data?.error || err.message}`);
        setHasMorePosts(false);
      } finally {
        setLoadingNextPage(false);
        setIsLoadingInitialPosts(false);
      }
    };

    fetchInitialData();
  }, [token, username, setOriginalPosts, setIsLoadingInitialPosts]);

  if (isLoadingInitialPosts) return <LoadingSpinner />;
  if (error && currentPosts.length === 0) return <div className="error-message">{error}</div>;

  const postsToRender = currentPosts;

  // Grid view with virtual scrolling
  if (viewMode === 'grid') {
    const itemsPerRow = window.innerWidth > 768 ? 4 : 2;
    const rowCount = Math.ceil(postsToRender.length / itemsPerRow);
    const rowHeight = 300;
    
    const Row = ({ index, style }) => {
      const fromIndex = index * itemsPerRow;
      const toIndex = Math.min(fromIndex + itemsPerRow, postsToRender.length);
      const items = [];
      
      for (let i = fromIndex; i < toIndex; i++) {
        const post = postsToRender[i];
        items.push(
          <div key={post.id} className="grid-item" style={{ width: `${100 / itemsPerRow}%` }}>
            <MediaItem 
              post={post} 
              viewMode="grid"
              isSelected={selectedPosts.has(post.id)}
              onSelect={() => onSelectPost(post.id)}
              onDownload={() => onDownload(post)}
            />
          </div>
        );
      }
      
      return (
        <div style={style} className="grid-row">
          {items}
        </div>
      );
    };
    
    return (
      <div className="gallery-container grid-view">
        <InfiniteLoader
          isItemLoaded={index => index < postsToRender.length}
          itemCount={hasMorePosts ? postsToRender.length + 1 : postsToRender.length}
          loadMoreItems={fetchNextPage}
        >
          {({ onItemsRendered, ref }) => (
            <List
              className="grid-list"
              height={window.innerHeight - 200}
              itemCount={rowCount}
              itemSize={rowHeight}
              onItemsRendered={onItemsRendered}
              ref={ref}
              width="100%"
            >
              {Row}
            </List>
          )}
        </InfiniteLoader>
      </div>
    );
  }

  // Feed view (existing implementation with enhancements)
  return (
    <div className="gallery-container">
      {postsToRender.length === 0 && !loadingNextPage && !error ? (
        <div className="no-media">
          <p>No media found in your saved posts.</p>
          <p>Try saving some posts with images, videos, or GIFs!</p>
        </div>
      ) : (
        <div className="media-feed">
          {/* Use virtual scrolling for feed view too */}
          <InfiniteLoader
            isItemLoaded={index => index < postsToRender.length}
            itemCount={hasMorePosts ? postsToRender.length + 1 : postsToRender.length}
            loadMoreItems={fetchNextPage}
          >
            {({ onItemsRendered, ref }) => (
              <List
                height={window.innerHeight - 150}
                itemCount={postsToRender.length}
                itemSize={window.innerHeight}
                onItemsRendered={onItemsRendered}
                ref={ref}
                width="100%"
              >
                {({ index, style }) => {
                  const post = postsToRender[index];
                  return (
                    <div style={style} key={`${post.id}-${index}`} className="post-container">
                      <MediaItem 
                        post={post}
                        viewMode="feed"
                        isSelected={selectedPosts.has(post.id)}
                        onSelect={() => onSelectPost(post.id)}
                        onDownload={() => onDownload(post)}
                      />
                      <div className="post-separator"></div>
                    </div>
                  );
                }}
              </List>
            )}
          </InfiniteLoader>
          {loadingNextPage && <LoadingSpinner />}
          {error && postsToRender.length > 0 && <div className="error-message" style={{margin: '20px auto'}}>{error}</div>}
          {!hasMorePosts && postsToRender.length > 0 && (
            <div className="end-message">
              <p>You've reached the end of your saved posts!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MediaGallery;
