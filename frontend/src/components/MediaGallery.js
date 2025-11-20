// src/components/MediaGallery.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import MediaItem from './MediaItem';
import LoadingSpinner from './LoadingSpinner';
import { useConfig } from '../ConfigContext';
import './MediaGallery.css';

// Receive props from App
function MediaGallery({
  setOriginalPosts, // Function to update the parent's original list
  currentPosts,     // List of posts to display (already sorted/shuffled by App)
  isLoadingInitialPosts, // Is the initial data load happening?
  setIsLoadingInitialPosts, // Function to update initial loading state
  isLoadingOrderChange   // Is the parent currently reordering posts?
}) {
  const { config } = useConfig(); // Only destructure what you need
  // State specific to gallery: pagination, loading next page, errors
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  // Add new state for visible range
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });

  // Ref for IntersectionObserver
  const observer = useRef();

  // Fetch media from backend server
  const fetchNextPage = useCallback(async () => {
    // Prevent fetching if already loading, no more posts, or username/token missing
    if (loadingNextPage || !hasMorePosts || !config.apiUrl) return;

    setLoadingNextPage(true);
    setError(null);
    
    try {
      // Call the backend media endpoint instead of Reddit API
      const response = await axios.get(`${config.apiUrl}/media`, {
        params: { 
          page,
          limit: page === 0 ? 20 : 10 // Get 20 initially, then 10 at a time
        }
      });

      const data = response.data.data;
      const newItems = data?.children || [];
      const hasMore = !!data?.after;

      // Update the *original* list in the App component by appending
      if (newItems.length > 0) {
        setOriginalPosts(prev => [...prev, ...newItems]);
      }

      // Update 'page' for the next request
      setPage(prev => prev + 1);
      // Check if more posts are available
      setHasMorePosts(hasMore);

    } catch (err) {
      console.error(`Error fetching media at ${config.apiUrl}/media:`, err);
      setError(`Failed to load media: ${err.response?.data?.error || err.message}`);
      setHasMorePosts(false); // Stop fetching on error
    } finally {
      setLoadingNextPage(false); // Reset loading state for next page
    }
  }, [loadingNextPage, hasMorePosts, page, setOriginalPosts, config.apiUrl]); // Include dependencies

  // Update intersection observer to trigger earlier
  const lastPostElementRef = useCallback(node => {
    // Don't observe if loading next page or if order is changing in parent
    if (loadingNextPage || isLoadingOrderChange) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        // Update visible range when approaching end
        setVisibleRange(prev => {
          const newEnd = Math.min(prev.end + 10, currentPosts.length);
          const newStart = Math.max(newEnd - 30, 0); // Keep 30 posts in memory
          return { start: newStart, end: newEnd };
        });

        // Fetch more if needed
        if (currentPosts.length - visibleRange.end <= 10 && hasMorePosts) {
          fetchNextPage();
        }
      }
    }, { threshold: 0.25 }); // Trigger earlier

    if (node) observer.current.observe(node);
  }, [loadingNextPage, hasMorePosts, fetchNextPage, isLoadingOrderChange, currentPosts.length, visibleRange.end]);

  // Effect for initial data load - Triggered by username change from App
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!isLoadingInitialPosts || !config.apiUrl) return; // Use config.apiUrl instead

      setLoadingNextPage(true);
      setError(null);
      setPage(0);
      setHasMorePosts(true);

      try {
        const response = await axios.get(`${config.apiUrl}/media`, { // Use config.apiUrl
          params: { page: 0 }
        });

        const initialItems = response.data.data.children || [];
        const hasMore = !!response.data.data.after;

        setOriginalPosts(initialItems);
        setPage(1);
        setHasMorePosts(hasMore);

      } catch (err) {
        console.error('Error fetching initial media:', err);
        setError(`Failed to load media: ${err.response?.data?.error || err.message}`);
        setHasMorePosts(false);
      } finally {
        setLoadingNextPage(false);
        setIsLoadingInitialPosts(false);
      }
    };

    fetchInitialData();
  }, [isLoadingInitialPosts, setOriginalPosts, setIsLoadingInitialPosts, config.apiUrl]);

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
          <p>No media found in the specified directory.</p>
        </div>
      ) : (
        <div className="media-feed">
          {postsToRender
            .slice(visibleRange.start, visibleRange.end)
            .map((post, index) => (
              <div 
                ref={index === Math.min(postsToRender.length, visibleRange.end) - visibleRange.start - 5 ? lastPostElementRef : null}
                key={`${post.id}-${index + visibleRange.start}`} 
                className="post-container"
              >
                <MediaItem post={post} />
                <div className="post-separator"></div>
              </div>
          ))}
          {/* Show loading spinner when fetching next page */}
          {loadingNextPage && <LoadingSpinner />}
          {/* Show error message if occurred during loading more */}
          {error && postsToRender.length > 0 && 
            <div className="error-message" style={{margin: '20px auto'}}>{error}</div>
          }
          {/* End message */}
          {!hasMorePosts && postsToRender.length > 0 && (
            <div className="end-message">
              <p>You've reached the end of the media files!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MediaGallery;
