import React, { useState } from 'react';
import './FilterPanel.css';

function FilterPanel({ filters, onFiltersChange, availableSubreddits }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleMediaTypeChange = (type) => {
    const newTypes = filters.mediaType.includes(type)
      ? filters.mediaType.filter(t => t !== type)
      : [...filters.mediaType, type];
    onFiltersChange({ ...filters, mediaType: newTypes });
  };

  const handleSubredditChange = (subreddit) => {
    const newSubreddits = filters.subreddit.includes(subreddit)
      ? filters.subreddit.filter(s => s !== subreddit)
      : [...filters.subreddit, subreddit];
    onFiltersChange({ ...filters, subreddit: newSubreddits });
  };

  return (
    <div className="filter-panel">
      <button 
        className="filter-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        Filters {filters.mediaType.length + filters.subreddit.length > 0 && 
          `(${filters.mediaType.length + filters.subreddit.length})`}
      </button>
      
      {isOpen && (
        <div className="filter-dropdown">
          <div className="filter-section">
            <h4>Media Type</h4>
            <label>
              <input
                type="checkbox"
                checked={filters.mediaType.includes('image')}
                onChange={() => handleMediaTypeChange('image')}
              />
              Images
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.mediaType.includes('video')}
                onChange={() => handleMediaTypeChange('video')}
              />
              Videos
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.mediaType.includes('gif')}
                onChange={() => handleMediaTypeChange('gif')}
              />
              GIFs
            </label>
          </div>
          
          <div className="filter-section">
            <h4>Date Range</h4>
            <select 
              value={filters.dateRange}
              onChange={(e) => onFiltersChange({ ...filters, dateRange: e.target.value })}
            >
              <option value="all">All Time</option>
              <option value="year">Past Year</option>
              <option value="month">Past Month</option>
              <option value="week">Past Week</option>
            </select>
          </div>
          
          {availableSubreddits.length > 0 && (
            <div className="filter-section">
              <h4>Subreddits</h4>
              <div className="subreddit-list">
                {availableSubreddits.slice(0, 10).map(sub => (
                  <label key={sub}>
                    <input
                      type="checkbox"
                      checked={filters.subreddit.includes(sub)}
                      onChange={() => handleSubredditChange(sub)}
                    />
                    r/{sub}
                  </label>
                ))}
              </div>
            </div>
          )}
          
          <button 
            className="clear-filters"
            onClick={() => onFiltersChange({ 
              mediaType: [], 
              subreddit: [], 
              dateRange: 'all' 
            })}
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default FilterPanel;
