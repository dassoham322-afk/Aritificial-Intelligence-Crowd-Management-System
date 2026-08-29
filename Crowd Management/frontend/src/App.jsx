import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import WelcomePage from './components/WelcomePage';
import DashboardPage from './components/DashboardPage';
import CounterPage from './components/CounterPage';
import './index.css';

function App() {
  const [activePage, setActivePage] = useState('welcome-page');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Theme state
  const [theme, setTheme] = useState('dark');

  // Load saved theme or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  }, []);

  // Update DOM and localStorage on theme change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  const navigateTo = (pageId) => {
    setActivePage(pageId);
    closeSidebar();
  };

  return (
    <div className={`app-container theme-${theme}`}>
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={closeSidebar} 
        activePage={activePage} 
        navigateTo={navigateTo} 
      />

      <div id="sidebar-overlay" className={`overlay ${isSidebarOpen ? 'active' : ''}`} onClick={closeSidebar}></div>

      <main id="main-content">
        <header className="top-header">
          <button id="hamburger-btn" className="hamburger-btn dynamic-btn" onClick={toggleSidebar}>
            <i className="fas fa-bars"></i>
          </button>
          
          <div className="header-title dynamic-panel">
            <span className="accent-line"></span>
            AAI NSCBI AIRPORT KOLKATA
          </div>
          
          <div className="header-right">
            <button className="theme-toggle dynamic-btn" onClick={toggleTheme} aria-label="Toggle Theme">
              {theme === 'light' ? <i className="fas fa-moon"></i> : <i className="fas fa-sun"></i>}
            </button>
            <span className="system-status dynamic-panel">
              <span className="pulse"></span> LIVE
            </span>
          </div>
        </header>

        <div id="pages-container">
          <WelcomePage isActive={activePage === 'welcome-page'} navigateTo={navigateTo} />
          <DashboardPage isActive={activePage === 'dashboard-page'} />
          <CounterPage isActive={activePage === 'counter-page'} />
        </div>
      </main>
    </div>
  );
}

export default App;
