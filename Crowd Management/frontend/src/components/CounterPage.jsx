import React, { useState, useEffect } from 'react';

const MAX_CAPACITY = 2;

const INITIAL_ROUTES = [
  { id: 1, destination: 'Kolkata → Delhi' },
  { id: 3, destination: 'Kolkata → Agra' },
  { id: 4, destination: 'Kolkata → Mumbai' },
  { id: 5, destination: 'Kolkata → Chennai' },
  { id: 6, destination: 'Kolkata → Bangalore' }
];

const generateCounters = () => {
  return INITIAL_ROUTES.flatMap((route) => {
    const num = route.id;
    const shortRoute = route.destination.replace('Kolkata', 'KOL').replace('Delhi', 'DEL').replace('Airport', 'APT').replace('Agra', 'AGR').replace('Mumbai', 'MUM').replace('Chennai', 'MAA').replace('Bangalore', 'BLR').replace(' → ', ' - ');
    return [
      { id: `${num}A`, routeId: route.id, name: `${shortRoute} ${num}A`, destination: route.destination, capacity: MAX_CAPACITY, inside: 0, enter: 0, exit: 0, status: 'INACTIVE' },
      { id: `${num}B`, routeId: route.id, name: `${shortRoute} ${num}B`, destination: route.destination, capacity: MAX_CAPACITY, inside: 0, enter: 0, exit: 0, status: 'INACTIVE' }
    ];
  });
};

const INITIAL_COUNTERS = generateCounters();

function CounterPage({ isActive }) {
  const [counters, setCounters] = useState(JSON.parse(JSON.stringify(INITIAL_COUNTERS)));
  const [totalPeopleCount, setTotalPeopleCount] = useState(0);
  const [trackedRouteId, setTrackedRouteId] = useState(null);

  // Auto-increment logic
  useEffect(() => {
    if (trackedRouteId === null) return;

    const handlePersonDetected = () => {
      setCounters(prevCounters => {
        let newCounters = [...prevCounters];
        const routeCounters = newCounters.map((c, idx) => ({...c, originalIndex: idx}))
          .filter(c => c.routeId === trackedRouteId);
        
        let targetIdx = routeCounters.findIndex(c => (c.status === 'ACTIVE' || c.status === 'NEAR CAPACITY' || c.status === 'AVAILABLE') && c.inside < c.capacity);
        
        if (targetIdx === -1) {
          targetIdx = routeCounters.findIndex(c => c.status === 'INACTIVE');
          if (targetIdx !== -1) {
             const actualIdx = routeCounters[targetIdx].originalIndex;
             newCounters[actualIdx] = { ...newCounters[actualIdx], status: 'ACTIVE' };
          } else {
             return prevCounters;
          }
        }
        
        const actualIdx = routeCounters[targetIdx].originalIndex;
        let activeCounter = { ...newCounters[actualIdx] };

        activeCounter.inside += 1;
        setTotalPeopleCount(prev => prev + 1);

        if (activeCounter.inside >= activeCounter.capacity) {
          activeCounter.status = 'FULL';
          newCounters[actualIdx] = activeCounter;
          if (targetIdx + 1 < routeCounters.length) {
            const nextActualIdx = routeCounters[targetIdx + 1].originalIndex;
            if (newCounters[nextActualIdx].status === 'INACTIVE') {
              newCounters[nextActualIdx] = { ...newCounters[nextActualIdx], status: 'ACTIVE' };
            }
          }
        } else if (activeCounter.inside === activeCounter.capacity - 1) {
          activeCounter.status = 'NEAR CAPACITY';
          newCounters[actualIdx] = activeCounter;
        } else {
          activeCounter.status = 'ACTIVE';
          newCounters[actualIdx] = activeCounter;
        }
        
        return newCounters;
      });
    };

    const handlePersonLost = () => {
      setCounters(prevCounters => {
        let newCounters = [...prevCounters];
        const routeCounters = newCounters.map((c, idx) => ({...c, originalIndex: idx}))
          .filter(c => c.routeId === trackedRouteId);
        
        let targetIdx = -1;
        for (let i = routeCounters.length - 1; i >= 0; i--) {
          if (routeCounters[i].inside > 0) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx === -1) return prevCounters;

        const actualIdx = routeCounters[targetIdx].originalIndex;
        let activeCounter = { ...newCounters[actualIdx] };
        
        activeCounter.inside = Math.max(0, activeCounter.inside - 1);
        setTotalPeopleCount(prev => Math.max(0, prev - 1));

        if (activeCounter.inside >= activeCounter.capacity) {
          activeCounter.status = 'FULL';
        } else if (activeCounter.inside === activeCounter.capacity - 1) {
          activeCounter.status = 'NEAR CAPACITY';
        } else {
          activeCounter.status = 'ACTIVE';
        }
        newCounters[actualIdx] = activeCounter;
        return newCounters;
      });
    };

    const handlePersonEntered = () => {
      setCounters(prevCounters => {
        let newCounters = [...prevCounters];
        const routeCounters = newCounters.map((c, idx) => ({...c, originalIndex: idx}))
          .filter(c => c.routeId === trackedRouteId);
        
        let targetIdx = routeCounters.findIndex(c => c.inside > 0);
        if (targetIdx === -1) targetIdx = 0;
        if (targetIdx >= routeCounters.length) return prevCounters;
        
        const actualIdx = routeCounters[targetIdx].originalIndex;
        let activeCounter = { ...newCounters[actualIdx] };
        activeCounter.enter += 1;
        newCounters[actualIdx] = activeCounter;
        return newCounters;
      });
    };

    const handlePersonExited = () => {
      setCounters(prevCounters => {
        let newCounters = [...prevCounters];
        const routeCounters = newCounters.map((c, idx) => ({...c, originalIndex: idx}))
          .filter(c => c.routeId === trackedRouteId);
        
        let targetIdx = routeCounters.findIndex(c => c.inside > 0);
        if (targetIdx === -1) targetIdx = 0;
        if (targetIdx >= routeCounters.length) return prevCounters;
        
        const actualIdx = routeCounters[targetIdx].originalIndex;
        let activeCounter = { ...newCounters[actualIdx] };
        activeCounter.exit += 1;
        newCounters[actualIdx] = activeCounter;
        return newCounters;
      });
    };

    window.addEventListener('person-detected', handlePersonDetected);
    window.addEventListener('person-lost', handlePersonLost);
    window.addEventListener('person-entered', handlePersonEntered);
    window.addEventListener('person-exited', handlePersonExited);
    return () => {
      window.removeEventListener('person-detected', handlePersonDetected);
      window.removeEventListener('person-lost', handlePersonLost);
      window.removeEventListener('person-entered', handlePersonEntered);
      window.removeEventListener('person-exited', handlePersonExited);
    };
  }, [trackedRouteId]);


  const processNewPassenger = (count = 1, specificRouteId = null) => {
    let newCounters = [...counters];
    let newTotal = totalPeopleCount;

    for (let i = 0; i < count; i++) {
      // Find valid indices: either filter by specificRouteId or all
      let validIndices = [];
      if (specificRouteId) {
        validIndices = newCounters.map((c, i) => c.routeId === specificRouteId ? i : -1).filter(i => i !== -1);
      } else {
        validIndices = newCounters.map((_, i) => i);
      }

      let activeIdx = validIndices.find(idx => {
        const c = newCounters[idx];
        return (c.status === 'ACTIVE' || c.status === 'NEAR CAPACITY' || c.status === 'AVAILABLE') && c.inside < c.capacity;
      });

      if (activeIdx === undefined) {
        activeIdx = validIndices.find(idx => newCounters[idx].status === 'INACTIVE');
        if (activeIdx !== undefined) {
          newCounters[activeIdx] = { ...newCounters[activeIdx], status: 'ACTIVE' };
        } else {
          console.warn("ALL RELEVANT COUNTERS FULL");
          break; // All full
        }
      }

      let activeCounter = { ...newCounters[activeIdx] };

      activeCounter.enter += 1;
      activeCounter.inside += 1;
      newTotal += 1;

      if (activeCounter.inside >= activeCounter.capacity) {
        activeCounter.status = 'FULL';
        newCounters[activeIdx] = activeCounter;

        // Try to activate next inactive counter in the same group
        const nextIdxInGroup = validIndices.findIndex(idx => idx === activeIdx) + 1;
        if (nextIdxInGroup < validIndices.length) {
          const nextActualIdx = validIndices[nextIdxInGroup];
          if (newCounters[nextActualIdx].status === 'INACTIVE') {
            newCounters[nextActualIdx] = { ...newCounters[nextActualIdx], status: 'ACTIVE' };
          }
        }
      } else if (activeCounter.inside === activeCounter.capacity - 1) {
        activeCounter.status = 'NEAR CAPACITY';
        newCounters[activeIdx] = activeCounter;
      } else {
        activeCounter.status = 'ACTIVE';
        newCounters[activeIdx] = activeCounter;
      }
    }

    setCounters(newCounters);
    setTotalPeopleCount(newTotal);
  };

  const processPassengerExit = (counterId = null) => {
    let newCounters = [...counters];
    let targetIdx = -1;

    if (counterId !== null) {
      targetIdx = newCounters.findIndex(c => c.id === counterId && c.inside > 0);
    } else {
      targetIdx = newCounters.findIndex(c => c.inside > 0);
    }

    if (targetIdx === -1) return;

    let targetCounter = { ...newCounters[targetIdx] };
    targetCounter.inside = Math.max(0, targetCounter.inside - 1);
    targetCounter.exit += 1;

    if (targetCounter.inside >= targetCounter.capacity) {
      targetCounter.status = 'FULL';
    } else if (targetCounter.inside === targetCounter.capacity - 1) {
      targetCounter.status = 'NEAR CAPACITY';
    } else {
      targetCounter.status = 'ACTIVE';
    }

    newCounters[targetIdx] = targetCounter;
    setCounters(newCounters);
  };

  const resetCounters = () => {
    setCounters(JSON.parse(JSON.stringify(INITIAL_COUNTERS)));
    setTotalPeopleCount(0);
  };

  const totalCurrentlyInside = counters.reduce((sum, c) => sum + c.inside, 0);
  const totalCapacity = counters.length * MAX_CAPACITY;
  const allFull = counters.length > 0 && counters.every(c => c.status === 'FULL');

  const toggleTracking = (routeId) => {
    if (trackedRouteId === routeId) {
      setTrackedRouteId(null);
    } else {
      setTrackedRouteId(routeId);
    }
  };

  return (
    <section id="counter-page" className={`page sub-bg ${isActive ? 'active' : ''}`}>
      <div className="page-content">
        <div className="page-header glass-panel counter-header">
          <div className="header-info">
            <h2><i className="fas fa-users"></i> Airport Terminal Counter Management</h2>
            <p>
              Real-time passenger allocation & automated queue balancing. 
              <strong> Maximum Threshold: {MAX_CAPACITY} passengers per counter</strong>
            </p>
          </div>
          <div className="counter-controls">
            <div className="global-stats">
              <span>Managed: <strong>{totalPeopleCount}</strong></span>
              <span style={{ margin: '0 8px', color: 'var(--border)' }}>|</span>
              <span>Occupancy: <strong>{totalCurrentlyInside} / {totalCapacity}</strong></span>
            </div>
            <button className="action-btn primary" onClick={() => processNewPassenger(1)} title="Add 1 Passenger">
              <i className="fas fa-user-plus"></i> +1 Passenger
            </button>
            <button className="action-btn secondary" onClick={() => processNewPassenger(2)} title="Add 2 Passengers (Fill 1 Counter)">
              <i className="fas fa-users"></i> +2 (Fill Counter)
            </button>
            <button className="action-btn outline" onClick={() => processPassengerExit()} disabled={totalCurrentlyInside === 0} title="Process Departure">
              <i className="fas fa-user-minus"></i> -1 Exit
            </button>
            <button className="action-btn danger" onClick={resetCounters} title="Reset All Counters">
              <i className="fas fa-redo"></i> Reset
            </button>
          </div>
        </div>
        
        {allFull && (
          <div id="global-status-banner" className="global-status-banner">
            <i className="fas fa-exclamation-triangle"></i> ALL COUNTERS AT MAXIMUM THRESHOLD - NO FURTHER ALLOCATIONS POSSIBLE
          </div>
        )}

        <div className="routes-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {INITIAL_ROUTES.map(route => {
            const isTracking = trackedRouteId === route.id;
            const routeCounters = counters.filter(c => c.routeId === route.id);
            
            return (
              <div key={route.id} className="route-group glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text)' }}>
                    {route.destination} {isTracking && <span style={{ color: 'var(--success)', fontSize: '0.9rem', marginLeft: '10px' }}><i className="fas fa-satellite-dish"></i> TRACKING ACTIVE</span>}
                  </h3>
                  <button 
                    className={`cam-btn ${isTracking ? 'danger' : 'primary'}`} 
                    onClick={() => toggleTracking(route.id)}
                  >
                    {isTracking ? <><i className="fas fa-stop"></i> Stop Tracking</> : <><i className="fas fa-play"></i> Start Tracking</>}
                  </button>
                </div>
                
                <div className="counters-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                  {routeCounters.map((counter, index) => {
                    let nextCounterText = '';
                    if (counter.status === 'FULL') {
                      if (index + 1 < routeCounters.length) {
                        nextCounterText = <>Threshold Reached (2/2) → <strong>{routeCounters[index+1].name} ACTIVE</strong></>;
                      } else {
                        nextCounterText = <strong>Route at Maximum Capacity</strong>;
                      }
                    } else if (counter.status === 'INACTIVE') {
                      nextCounterText = 'Standby (Activates when previous counter reaches limit)';
                    } else if (counter.status === 'NEAR CAPACITY') {
                      nextCounterText = '1 Passenger Inside (1 slot remaining)';
                    } else {
                      nextCounterText = 'Available (0/2 Occupancy)';
                    }

                    const statusClass = counter.status.toLowerCase().replace(' ', '-');

                    return (
                      <div key={counter.id} className={`counter-card ${statusClass}`}>
                        <div className="counter-header-box">
                          <div className="counter-title">
                            <h3>{counter.name}</h3>
                          </div>
                          <span className="status-badge">{counter.status}</span>
                        </div>
                        
                        <div className="counter-body">
                          <div className="capacity-info">
                            <span className="capacity-label">Threshold Limit</span>
                            <span className="capacity-value">{counter.capacity} Persons</span>
                          </div>
                          
                          <div className="occupancy-display">
                            <div className="occupancy-circle">
                              <span className="inside-count">{counter.inside}</span>
                              <span className="inside-label">Inside</span>
                            </div>
                          </div>
                          
                          <div className="counter-stats">
                            <div className="mini-stat enter">
                              <span>Entered</span>
                              <strong>{counter.enter < 10 ? '0' + counter.enter : counter.enter}</strong>
                            </div>
                            <div className="mini-stat exit">
                              <span>Exited</span>
                              <strong>{counter.exit < 10 ? '0' + counter.exit : counter.exit}</strong>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', margin: '12px 0 6px 0' }}>
                            <button 
                              className="cam-btn primary" 
                              style={{ flex: 1, justifyContent: 'center', padding: '6px 10px', fontSize: '0.8rem' }}
                              onClick={() => processNewPassenger(1, route.id)}
                              disabled={counter.status === 'FULL'}
                            >
                              <i className="fas fa-plus"></i> Passenger
                            </button>
                            <button 
                              className="cam-btn danger" 
                              style={{ flex: 1, justifyContent: 'center', padding: '6px 10px', fontSize: '0.8rem' }}
                              onClick={() => processPassengerExit(counter.id)}
                              disabled={counter.inside === 0}
                            >
                              <i className="fas fa-minus"></i> Checkout
                            </button>
                          </div>
                          
                          <div className="next-counter-info">
                            {nextCounterText}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default CounterPage;
