import React from 'react';
import './SearchBar.css';

function SearchBar({ searchQuery, onSearchChange }) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search posts..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
      {searchQuery && (
        <button 
          className="clear-search"
          onClick={() => onSearchChange('')}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default SearchBar;
