import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the context
const ConfigContext = createContext(null);

// Provider component that provides the configuration
export function ConfigProvider({ children }) {
  // Initialize config with default values instead of undefined
  const [config] = useState({
    redditClientId: process.env.REACT_APP_REDDIT_CLIENT_ID || '',
    redditCallback: process.env.REACT_APP_URL_REDDIT_CALLBACK || '',
    apiUrl: process.env.REACT_APP_API_URL || '',
  });

  // Initialize error state
  const [error, setError] = useState(null);

  useEffect(() => {
    // Validate required configurations
    if (!config.redditClientId) {
      setError(new Error('Reddit Client ID is missing from environment variables'));
    }
    if (!config.redditCallback) {
      console.warn('Warning: Reddit Callback URL is missing from environment variables');
    }
  }, [config]);

  // Ensure we're passing an object with proper structure
  const contextValue = {
    config,
    error: error ? error.message : null // Convert Error object to string
  };

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
}

// Hook for components to use the config
export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === null) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
