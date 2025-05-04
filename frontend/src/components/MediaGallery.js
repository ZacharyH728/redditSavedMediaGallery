// src/components/MediaGallery.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import MediaItem from './MediaItem';
import LoadingSpinner from './LoadingSpinner';
import './MediaGallery.css';

// Receive props from App
function MediaGallery({
  token,
  username,
  setOriginalPosts, // Function to update the parent's original list
  currentPosts,     // List of posts to display (already sorted/shuffled by App)
  isLoadingInitialPosts, // Is the initial data load happening?
  setIsLoadingInitialPosts, // Function to update initial loading state
  isLoadingOrderChange   // Is the parent currently reordering posts?
}) {
  // State specific to gallery: pagination, loading next page, errors
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const [error, setError] = useState(null);
  const [after, setAfter] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  // Ref for IntersectionObserver
  const observer = useRef();

  // Filter and map raw Reddit data (can remain here or move to utils)
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

  // Fetch the next page of posts
  const fetchNextPage = useCallback(async () => {
    // Prevent fetching if already loading, no more posts, or username/token missing
    if (loadingNextPage || !hasMorePosts || !username || !token) return;

    setLoadingNextPage(true);
    setError(null); // Clear previous errors
    console.log(`MediaGallery: Fetching next page for ${username}, after: ${after}`);

    try {
      const savedResponse = await axios.get(
        `http://localhost:4000/api/saved/${username}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          params: { after: after } // Send the current 'after' value
        }
      );

      const newChildren = savedResponse.data?.data?.children || [];
      const newAfter = savedResponse.data?.data?.after;
      const newPosts = processPosts(newChildren);

      console.log(`MediaGallery: Fetched ${newPosts.length} new media posts. Next 'after': ${newAfter}`);

      // Update the *original* list in the App component by appending
      if (newPosts.length > 0) {
        setOriginalPosts(prev => [...prev, ...newPosts]);
      }

      // Update 'after' for the next request
      setAfter(newAfter);
      // Check if more posts are available
      setHasMorePosts(!!newAfter && newChildren.length > 0);

    } catch (err) {
      console.error('MediaGallery: Error fetching next page:', err);
      setError(`Failed to load more posts: ${err.response?.data?.error || err.message}`);
      setHasMorePosts(false); // Stop fetching on error
    } finally {
      setLoadingNextPage(false); // Reset loading state for next page
    }
  }, [loadingNextPage, hasMorePosts, after, username, token, setOriginalPosts]); // Include dependencies

  // Callback ref for the last post element
  const lastPostElementRef = useCallback(node => {
    // Don't observe if loading next page or if order is changing in parent
    if (loadingNextPage || isLoadingOrderChange) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMorePosts) {
        fetchNextPage(); // Fetch next page when last item is visible
      }
    }, { threshold: 0.5 });

    if (node) observer.current.observe(node);
  }, [loadingNextPage, hasMorePosts, fetchNextPage, isLoadingOrderChange]); // Include dependencies

  // Effect for initial data load - Triggered by username change from App
  useEffect(() => {
    const fetchInitialData = async () => {
        // Only run if token and username are present, and initial load is marked
        if (!token || !username || !isLoadingInitialPosts) {
             if (!token && !username) setIsLoadingInitialPosts(false); // Ensure loading stops if logged out
            return;
        }

      console.log(`MediaGallery: Starting initial fetch for ${username}...`);
      setLoadingNextPage(true); // Use loadingNextPage state for consistency
      setError(null);
      setAfter(null);
      setHasMorePosts(true);

      try {
        const savedResponse = await axios.get(
          `http://localhost:4000/api/saved/${username}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { after: null } // Explicitly fetch first page
          }
        );

        const initialChildren = savedResponse.data?.data?.children || [];
        const initialAfter = savedResponse.data?.data?.after;
        const initialPosts = processPosts(initialChildren);

        console.log(`MediaGallery: Initial fetch found ${initialPosts.length} posts. Next 'after': ${initialAfter}`);

        // Set the *initial* original posts list in App
        setOriginalPosts(initialPosts);
        // App's useEffect will handle setting currentPosts

        setAfter(initialAfter);
        setHasMorePosts(!!initialAfter && initialChildren.length > 0);

      } catch (err) {
        console.error('MediaGallery: Error fetching initial data:', err);
        setError(`Failed to load initial posts: ${err.response?.data?.error || err.message}`);
        setHasMorePosts(false);
      } finally {
        setLoadingNextPage(false);
        setIsLoadingInitialPosts(false); // Mark initial load as complete
      }
    };

    fetchInitialData();
    // Important: Run only when username changes (after token is set)
  }, [token, username, setOriginalPosts, setIsLoadingInitialPosts]);

  // Use isLoadingInitialPosts for the very first loading screen
  if (isLoadingInitialPosts) return <LoadingSpinner />;

  // Display error if occurred during initial or subsequent fetches
  if (error && currentPosts.length === 0) return <div className="error-message">{error}</div>;

  // Use currentPosts (managed and sorted/shuffled by App) for rendering
  const postsToRender = currentPosts;

  return (
    <div className="gallery-container">
      {/* Header is now managed by App.js */}

      {postsToRender.length === 0 && !loadingNextPage && !error ? (
        // Show no media message only if not loading and no error
        <div className="no-media">
          <p>No media found in your saved posts.</p>
          <p>Try saving some posts with images, videos, or GIFs!</p>
        </div>
      ) : (
        <div className="media-feed">
          {postsToRender.map((post, index) => {
            // Attach ref to the last element for IntersectionObserver
            if (index === postsToRender.length - 1) {
              return (
                <div ref={lastPostElementRef} key={`${post.id}-${index}`} className="post-container">
                  <MediaItem post={post} />
                  <div className="post-separator"></div>
                </div>
              );
            } else {
              return (
                <div key={`${post.id}-${index}`} className="post-container">
                  <MediaItem post={post} />
                  <div className="post-separator"></div>
                </div>
              );
            }
          })}
          {/* Show loading spinner when fetching next page */}
          {loadingNextPage && <LoadingSpinner />}
          {/* Show error message if occurred during loading more */}
          {error && postsToRender.length > 0 && <div className="error-message" style={{margin: '20px auto'}}>{error}</div> }
          {/* End message */}
          {!hasMorePosts && postsToRender.length > 0 && (
            <div className="end-message">
              <p>You've reached the end of your saved posts!</p>
              {/* Buttons are now in the main AppHeader */}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MediaGallery;
