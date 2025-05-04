import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the context
const ConfigContext = createContext(null);

// Provider component that fetches and provides the configuration
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({
    redditClientId: null, // Start with null values
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch configuration when component mounts
    async function fetchConfig() {
      try {
        const response = await fetch('/config.json');
        if (!response.ok) {
          throw new Error(`Failed to load config: ${response.status}`);
        }
        
        const loadedConfig = await response.json();
        setConfig(loadedConfig);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load configuration:', err);
        setError(err);
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  // Provide both the config and loading state
  return (
    <ConfigContext.Provider value={{ config, loading, error }}>
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
