import React from 'react';

function Sidebar({ isOpen, onClose, activePage, navigateTo }) {
  return (
    <nav id="sidebar" className={`sidebar ${isOpen ? 'active' : ''}`}>
      <div className="sidebar-header">
        <h3>
          <i className="fas fa-plane-departure sidebar-logo-icon"></i>
          AAI NSCBI
        </h3>
        <button id="close-btn" className="close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <ul className="nav-links">
        <li>
          <a
            href="#"
            className={activePage === 'welcome-page' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); navigateTo('welcome-page'); }}
          >
            <i className="fas fa-home"></i>
            Welcome
          </a>
        </li>
        <li>
          <a
            href="#"
            className={activePage === 'dashboard-page' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); navigateTo('dashboard-page'); }}
          >
            <i className="fas fa-tachometer-alt"></i>
            Dashboard
          </a>
        </li>
        <li>
          <a
            href="#"
            className={activePage === 'counter-page' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); navigateTo('counter-page'); }}
          >
            <i className="fas fa-users"></i>
            Counter
          </a>
        </li>
      </ul>

      <div className="sidebar-footer">
        AAI · NSCBI KOLKATA · v1.0
      </div>
    </nav>
  );
}

export default Sidebar;
