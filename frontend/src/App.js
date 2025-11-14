// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import Header from './components/Header';
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
  const [originalPosts, setOriginalPosts] = useState([]);
  const [currentPosts, setCurrentPosts] = useState([]);
  const [isRandomOrder, setIsRandomOrder] = useState(true);
  const [isLoadingOrderChange, setIsLoadingOrderChange] = useState(false);
  const [isLoadingInitialPosts, setIsLoadingInitialPosts] = useState(true);

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
  }, [originalPosts, isRandomOrder]);

  // Reshuffle posts - Managed by App
  const handleReshuffle = useCallback(() => {
    if (isLoadingOrderChange) return;
    setIsLoadingOrderChange(true);
    setTimeout(() => {
      setCurrentPosts(shuffleArray([...originalPosts]));
      setIsLoadingOrderChange(false);
    }, 50);
  }, [originalPosts, isLoadingOrderChange]);

  const toggleOrderMode = useCallback(() => {
    if (isLoadingOrderChange) return;
    setIsRandomOrder(prev => !prev);
  }, [isLoadingOrderChange]);

  return (
    <Router>
      <div className="app">
        <Header
          isRandomOrder={isRandomOrder}
          toggleOrderMode={toggleOrderMode}
          handleReshuffle={handleReshuffle}
          isLoadingOrderChange={isLoadingOrderChange}
          showAuthControls={false} // Hide auth-related controls
        />
        <main className="app-content">
          <MediaGallery
            setOriginalPosts={setOriginalPosts}
            currentPosts={currentPosts}
            isLoadingInitialPosts={isLoadingInitialPosts}
            setIsLoadingInitialPosts={setIsLoadingInitialPosts}
            isLoadingOrderChange={isLoadingOrderChange}
          />
        </main>
        <footer className="app-footer">
          <p>Local Media Gallery &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
