import React from 'react';

const TICKER_TEXT =
  '✈  IC 301 · KOLKATA → DELHI · ON TIME  ·  ✈  AI 733 · KOLKATA → MUMBAI · ON TIME  ·  ' +
  '✈  6E 441 · KOLKATA → BANGALORE · BOARDING  ·  ✈  SG 212 · KOLKATA → HYDERABAD · ON TIME  ·  ' +
  '✈  UK 743 · KOLKATA → CHENNAI · DELAYED  ·  ✈  G8 117 · KOLKATA → AGRA · ON TIME  ·  ' +
  '✈  AI 540 · KOLKATA → GOA · ON TIME  ·  ✈  6E 222 · KOLKATA → JAIPUR · ON TIME  ·  ';

function WelcomePage({ isActive }) {
  return (
    <section id="welcome-page" className={`page landing-bg ${isActive ? 'active' : ''}`}>
      <div className="welcome-overlay">
        <div className="welcome-content">

          {/* ── FIDS top ribbon ── */}
          <div className="fids-ribbon">
            <div className="fids-ribbon-left">
              <span className="fids-ribbon-badge">AAI</span>
              <span className="fids-ribbon-title">NETAJI SUBHAS CHANDRA BOSE INTERNATIONAL · KOLKATA</span>
            </div>
            <div className="fids-ribbon-right">
              <div className="fids-ribbon-stat">
                <span>DEPARTURES</span>
                <strong>24</strong>
              </div>
              <div className="fids-ribbon-stat">
                <span>ARRIVALS</span>
                <strong>18</strong>
              </div>
              <div className="fids-ribbon-stat">
                <span>TERMINALS</span>
                <strong>02</strong>
              </div>
            </div>
          </div>

          {/* ── Card body ── */}
          <div className="welcome-body">
            <div className="logo-icon-wrap">
              <i className="fas fa-plane-departure"></i>
            </div>

            <h1>AAI – NSCBI AIRPORT KOLKATA</h1>
            <h2>PEOPLE MONITORING SYSTEM</h2>

            <div className="welcome-divider"></div>

            <p>
              AI-powered real-time monitoring and people-counting system
              for Airports Authority of India. Tracks passenger flow,
              counter allocation and occupancy across all terminals.
            </p>

            <div className="status-indicator">
              <span className="pulse"></span>
              SYSTEM STATUS:&nbsp;<strong className="status-online">ONLINE &amp; ACTIVE</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrolling departures ticker ── */}
      <div className="fids-ticker">
        <span className="fids-ticker-inner">{TICKER_TEXT}{TICKER_TEXT}</span>
      </div>
    </section>
  );
}

export default WelcomePage;
