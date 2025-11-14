// src/components/Header.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Header.css'; // Create or update this CSS file

function Header({
  token,
  username,
  handleLogout,
  isRandomOrder,
  toggleOrderMode,
  handleReshuffle,
  isLoadingOrderChange // Receive loading state
}) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        Reddit Saved Media Gallery
      </div>
      <div className="header-controls">
        {token && username && (
          <>
            {/* Sort/Shuffle Buttons */}
            <div className="header-sort-controls">
              <button
                className={`header-button order-toggle-button ${isRandomOrder ? 'random-active' : 'default-active'}`}
                onClick={toggleOrderMode}
                disabled={isLoadingOrderChange} // Disable while changing order
                title={isRandomOrder ? 'Switch to Default Order' : 'Switch to Random Order'}
              >
                {/* Icon or Text for Toggle */}
                <span className="button-icon">{isRandomOrder ? '🔀' : '➡️'}</span> {/* Example icons */}
                <span className="button-text">{isRandomOrder ? 'Random' : 'Default'}</span>
              </button>
              {isRandomOrder && ( // Show shuffle only in random mode
                <button
                  className="header-button reshuffle-button"
                  onClick={handleReshuffle}
                  disabled={isLoadingOrderChange} // Disable while changing order
                  title="Shuffle Again"
                >
                   <span className="button-icon">🔄</span> {/* Example icon */}
                   <span className="button-text">Shuffle</span>
                </button>
              )}
            </div>

            {/* User Info and Logout */}
            <div className="user-info">
              <span className="username-display">u/{username}</span>
              <button className="header-button logout-button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default Header;
