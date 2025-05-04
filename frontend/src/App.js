// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import Auth from './components/Auth';
import AuthCallback from './components/AuthCallback';
import MediaGallery from './components/MediaGallery';
import './App.css';

// Fisher-Yates shuffle algorithm
const shuffleArray = (array) => {
  if (!Array.isArray(array)) return [];
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('reddit_token') || null);
  const [username, setUsername] = useState('');
  const [isRandomOrder, setIsRandomOrder] = useState(true); // Default sort order
  // --- State Management Changes ---
  const [originalPosts, setOriginalPosts] = useState([]); // Stores ALL fetched posts in ORIGINAL order
  const [currentPosts, setCurrentPosts] = useState([]); // Stores the derived list (shuffled or original) for display
  const [isLoadingOrderChange, setIsLoadingOrderChange] = useState(false);
  const [isLoadingInitialPosts, setIsLoadingInitialPosts] = useState(true); // Track only the very first load

  // Effect to update currentPosts whenever originalPosts or isRandomOrder changes
  useEffect(() => {
    console.log(`App: Updating currentPosts. isRandomOrder: ${isRandomOrder}, originalPosts count: ${originalPosts.length}`);
    setIsLoadingOrderChange(true);
    // Use a microtask or short timeout to allow potential state updates to settle
    queueMicrotask(() => {
      if (isRandomOrder) {
        setCurrentPosts(shuffleArray(originalPosts));
      } else {
        setCurrentPosts([...originalPosts]); // Use a fresh copy
      }
       setIsLoadingOrderChange(false);
    });
  }, [originalPosts, isRandomOrder]); // Run whenever the source list or order preference changes

  // Fetch username when token changes
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (token) {
        // Reset state on token change before fetching
        setUsername('');
        setOriginalPosts([]);
        setCurrentPosts([]);
        setIsLoadingInitialPosts(true);
        try {
          console.log("App: Fetching user info...");
          const response = await axios.get('http://localhost:4000/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          setUsername(response.data?.name || '');
          console.log("App: Username set:", response.data?.name);
        } catch (error) {
          console.error("App: Failed to fetch username", error);
          if (error.response?.status === 401) {
            handleLogout();
          } else {
              setIsLoadingInitialPosts(false); // Stop initial load if user fetch fails but token might be valid otherwise
          }
        }
      } else {
        setUsername('');
        setOriginalPosts([]);
        setCurrentPosts([]);
        setIsLoadingInitialPosts(false); // No token, not loading
      }
    };
    fetchUserInfo();
  }, [token]);

  // Handler for setting the token and clearing state
  const handleSetToken = (newToken) => {
    setToken(newToken);
    if (newToken) {
      localStorage.setItem('reddit_token', newToken);
    } else {
      localStorage.removeItem('reddit_token');
      localStorage.removeItem('reddit_refresh_token');
      // State clearing now happens in the useEffect for token change
    }
  };

  // Handler for logging out
  const handleLogout = () => {
    handleSetToken(null); // Clears token and triggers state reset via useEffect
  };

  // Toggle between random and default order - Managed by App
  // This just updates the flag; the useEffect handles the shuffling/sorting
  const toggleOrderMode = useCallback(() => {
    if (isLoadingOrderChange) return;
    setIsRandomOrder(prev => !prev);
  }, [isLoadingOrderChange]);

  // Reshuffle posts - Managed by App
  const handleReshuffle = useCallback(() => {
    if (isLoadingOrderChange) return;
    if (!isRandomOrder) {
      // If not random, switch to random mode first
      setIsRandomOrder(true); // useEffect will trigger shuffle
    } else {
      // If already random, just trigger the useEffect again by resetting originalPosts (forces reshuffle)
      // A slightly hacky way, but ensures the useEffect runs: create new array reference
      setIsLoadingOrderChange(true);
      setTimeout(() => { // Allow loading state to show
          setCurrentPosts(shuffleArray(originalPosts)); // Directly reshuffle
          setIsLoadingOrderChange(false);
      }, 50);

    }
  }, [isRandomOrder, originalPosts, isLoadingOrderChange]); // Added originalPosts dependency

  return (
    <Router>
      <div className="app">
        <Header
          token={token}
          username={username}
          handleLogout={handleLogout}
          isRandomOrder={isRandomOrder}
          toggleOrderMode={toggleOrderMode}
          handleReshuffle={handleReshuffle}
          isLoadingOrderChange={isLoadingOrderChange}
        />
        <main className="app-content">
          <Routes>
            <Route path="/auth-callback" element={<AuthCallback setToken={handleSetToken} />} />
            <Route path="/" element={!token ? <Auth /> : <Navigate to="/gallery" replace />} />
            <Route
              path="/gallery"
              element={
                token ? (
                  <MediaGallery
                    token={token}
                    username={username} // Pass username for fetching trigger
                    // Pass down the functions/state needed for gallery to operate
                    setOriginalPosts={setOriginalPosts} // Give gallery ability to add to original list
                    currentPosts={currentPosts} // Gallery displays this list
                    isLoadingInitialPosts={isLoadingInitialPosts} // Pass initial loading state
                    setIsLoadingInitialPosts={setIsLoadingInitialPosts} // Allow gallery to update initial loading state
                    isLoadingOrderChange={isLoadingOrderChange} // Let gallery know if reordering is happening
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <p>Reddit Saved Media Gallery &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
