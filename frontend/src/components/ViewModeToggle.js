import React from 'react';
import './ViewModeToggle.css';

function ViewModeToggle({ viewMode, onViewModeChange }) {
  return (
    <div className="view-mode-toggle">
      <button
        className={`view-mode-btn ${viewMode === 'feed' ? 'active' : ''}`}
        onClick={() => onViewModeChange('feed')}
        aria-label="Feed view"
        title="Feed view"
      >
        <span className="icon">📋</span>
      </button>
      <button
        className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
        onClick={() => onViewModeChange('grid')}
        aria-label="Grid view"
        title="Grid view"
      >
        <span className="icon">⚏</span>
      </button>
    </div>
  );
}

export default ViewModeToggle;
