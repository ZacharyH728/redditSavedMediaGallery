import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Header from './components/Header';
import Auth from './components/Auth';
import AuthCallback from './components/AuthCallback';
import MediaGallery from './components/MediaGallery';
import SearchBar from './components/SearchBar';
import FilterPanel from './components/FilterPanel';
import ViewModeToggle from './components/ViewModeToggle';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
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
  const [isRandomOrder, setIsRandomOrder] = useState(true);
  const [originalPosts, setOriginalPosts] = useState([]);
  const [currentPosts, setCurrentPosts] = useState([]);
  const [isLoadingOrderChange, setIsLoadingOrderChange] = useState(false);
  const [isLoadingInitialPosts, setIsLoadingInitialPosts] = useState(true);
  
  // New state for search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    mediaType: [],
    subreddit: [],
    dateRange: 'all'
  });
  const [viewMode, setViewMode] = useState('feed'); // 'feed' or 'grid'
  const [selectedPosts, setSelectedPosts] = useState(new Set());
  
  // Collections/Albums feature
  const [collections, setCollections] = useState(() => {
    const saved = localStorage.getItem('reddit_collections');
    return saved ? JSON.parse(saved) : {};
  });

  // Filter and search posts
  const filteredPosts = useMemo(() => {
    let filtered = [...originalPosts];
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(post => 
        post.title.toLowerCase().includes(query) ||
        post.subreddit.toLowerCase().includes(query) ||
        post.author.toLowerCase().includes(query)
      );
    }
    
    // Apply media type filter
    if (filters.mediaType.length > 0) {
      filtered = filtered.filter(post => {
        const postType = getMediaType(post);
        return filters.mediaType.includes(postType);
      });
    }
    
    // Apply subreddit filter
    if (filters.subreddit.length > 0) {
      filtered = filtered.filter(post => 
        filters.subreddit.includes(post.subreddit)
      );
    }
    
    // Apply date range filter
    if (filters.dateRange !== 'all') {
      const now = Date.now() / 1000;
      const ranges = {
        week: 7 * 24 * 60 * 60,
        month: 30 * 24 * 60 * 60,
        year: 365 * 24 * 60 * 60
      };
      const cutoff = now - ranges[filters.dateRange];
      filtered = filtered.filter(post => post.created_utc > cutoff);
    }
    
    return filtered;
  }, [originalPosts, searchQuery, filters]);

  // Helper function to determine media type
  const getMediaType = (post) => {
    if (post.is_video || post.url.includes('v.redd.it')) return 'video';
    if (post.url.match(/\.gif$/i) || post.url.includes('gfycat') || post.url.includes('redgifs')) return 'gif';
    return 'image';
  };

  // Get unique subreddits for filter options
  const uniqueSubreddits = useMemo(() => {
    return [...new Set(originalPosts.map(post => post.subreddit))].sort();
  }, [originalPosts]);

  // Effect to update currentPosts whenever filteredPosts or isRandomOrder changes
  useEffect(() => {
    console.log(`App: Updating currentPosts. isRandomOrder: ${isRandomOrder}, filteredPosts count: ${filteredPosts.length}`);
    setIsLoadingOrderChange(true);
    
    setTimeout(() => {
      if (isRandomOrder) {
        setCurrentPosts(shuffleArray(filteredPosts));
      } else {
        setCurrentPosts([...filteredPosts]);
      }
      setIsLoadingOrderChange(false);
    }, 100);
  }, [filteredPosts, isRandomOrder]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key) {
        case 'g':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setViewMode(prev => prev === 'feed' ? 'grid' : 'feed');
          }
          break;
        case 'r':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleReshuffle();
          }
          break;
        case 'Escape':
          setSelectedPosts(new Set());
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSelectedPosts(new Set(currentPosts.map(p => p.id)));
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPosts]);

  // Fetch username when token changes
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (token) {
        setUsername('');
        setOriginalPosts([]);
        setCurrentPosts([]);
        setIsLoadingInitialPosts(true);
        try {
          console.log("App: Fetching user info...");
          const response = await axios.get('http://192.168.1.164:4000/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          setUsername(response.data?.name || '');
          console.log("App: Username set:", response.data?.name);
        } catch (error) {
          console.error("App: Failed to fetch username", error);
          if (error.response?.status === 401) {
            handleLogout();
          } else {
            setIsLoadingInitialPosts(false);
          }
        }
      } else {
        setUsername('');
        setOriginalPosts([]);
        setCurrentPosts([]);
        setIsLoadingInitialPosts(false);
      }
    };
    fetchUserInfo();
  }, [token]);

  // Save collections to localStorage when they change
  useEffect(() => {
    localStorage.setItem('reddit_collections', JSON.stringify(collections));
  }, [collections]);

  const handleSetToken = (newToken) => {
    setToken(newToken);
    if (newToken) {
      localStorage.setItem('reddit_token', newToken);
    } else {
      localStorage.removeItem('reddit_token');
      localStorage.removeItem('reddit_refresh_token');
    }
  };

  const handleLogout = () => {
    handleSetToken(null);
  };

  const toggleOrderMode = useCallback(() => {
    if (isLoadingOrderChange) return;
    setIsRandomOrder(prev => !prev);
  }, [isLoadingOrderChange]);

  const handleReshuffle = useCallback(() => {
    if (isLoadingOrderChange) return;
    if (!isRandomOrder) {
      setIsRandomOrder(true);
    } else {
      setIsLoadingOrderChange(true);
      setTimeout(() => {
        setCurrentPosts(shuffleArray(filteredPosts));
        setIsLoadingOrderChange(false);
      }, 50);
    }
  }, [isRandomOrder, filteredPosts, isLoadingOrderChange]);

  // Collection management functions
  const createCollection = (name) => {
    const id = Date.now().toString();
    setCollections(prev => ({
      ...prev,
      [id]: {
        id,
        name,
        posts: [],
        created: Date.now()
      }
    }));
    return id;
  };

  const addToCollection = (collectionId, postIds) => {
    setCollections(prev => ({
      ...prev,
      [collectionId]: {
        ...prev[collectionId],
        posts: [...new Set([...prev[collectionId].posts, ...postIds])]
      }
    }));
  };

  const removeFromCollection = (collectionId, postIds) => {
    setCollections(prev => ({
      ...prev,
      [collectionId]: {
        ...prev[collectionId],
        posts: prev[collectionId].posts.filter(id => !postIds.includes(id))
      }
    }));
  };

  const deleteCollection = (collectionId) => {
    setCollections(prev => {
      const { [collectionId]: deleted, ...rest } = prev;
      return rest;
    });
  };

  // Bulk actions
  const handleBulkDownload = async () => {
    const selectedPostsArray = currentPosts.filter(post => selectedPosts.has(post.id));
    for (const post of selectedPostsArray) {
      try {
        await downloadMedia(post);
        // Add delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to download ${post.title}:`, error);
      }
    }
  };

  const handleBulkUnsave = async () => {
    if (!window.confirm(`Are you sure you want to unsave ${selectedPosts.size} posts?`)) return;
    
    for (const postId of selectedPosts) {
      try {
        await axios.post(`http://192.168.1.164:4000/api/unsave/${postId}`, null, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        // Remove from local state
        setOriginalPosts(prev => prev.filter(p => p.id !== postId));
      } catch (error) {
        console.error(`Failed to unsave post ${postId}:`, error);
      }
    }
    setSelectedPosts(new Set());
  };

  // Download function
  const downloadMedia = async (post) => {
    try {
      const response = await axios.get('http://192.168.1.164:4000/api/proxy-download', {
        headers: { 'Authorization': `Bearer ${token}` },
        params: { url: post.url },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${post.title.replace(/[^a-z0-9]/gi, '_')}.${getFileExtension(post)}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const getFileExtension = (post) => {
    const urlMatch = post.url.match(/\.([a-z0-9]+)$/i);
    if (urlMatch) return urlMatch[1];
    if (post.is_video) return 'mp4';
    return 'jpg';
  };

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
        
        {token && (
          <div className="app-toolbar">
            <SearchBar 
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            <FilterPanel 
              filters={filters}
              onFiltersChange={setFilters}
              availableSubreddits={uniqueSubreddits}
            />
            <ViewModeToggle 
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        )}
        
        {selectedPosts.size > 0 && (
          <div className="bulk-actions">
            <span>{selectedPosts.size} selected</span>
            <button onClick={handleBulkDownload}>Download Selected</button>
            <button onClick={handleBulkUnsave}>Unsave Selected</button>
            <button onClick={() => {
              const collectionId = prompt('Collection name:');
              if (collectionId) {
                const id = createCollection(collectionId);
                addToCollection(id, Array.from(selectedPosts));
                setSelectedPosts(new Set());
              }
            }}>Add to Collection</button>
            <button onClick={() => setSelectedPosts(new Set())}>Clear Selection</button>
          </div>
        )}
        
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
                    username={username}
                    setOriginalPosts={setOriginalPosts}
                    currentPosts={currentPosts}
                    isLoadingInitialPosts={isLoadingInitialPosts}
                    setIsLoadingInitialPosts={setIsLoadingInitialPosts}
                    isLoadingOrderChange={isLoadingOrderChange}
                    viewMode={viewMode}
                    selectedPosts={selectedPosts}
                    onSelectPost={(postId) => {
                      setSelectedPosts(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(postId)) {
                          newSet.delete(postId);
                        } else {
                          newSet.add(postId);
                        }
                        return newSet;
                      });
                    }}
                    collections={collections}
                    onDownload={downloadMedia}
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

// Register service worker for PWA
serviceWorkerRegistration.register();

export default App;
