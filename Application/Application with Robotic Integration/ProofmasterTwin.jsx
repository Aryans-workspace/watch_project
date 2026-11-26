import React, { useState, useEffect, useRef } from 'react';
import './ProofmasterTwin.css';

const ProofmasterTwin = () => {
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // 'pass', 'fail', or null
  const [isClosed, setIsClosed] = useState(false);
  const [robotConnected, setRobotConnected] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [slotResults, setSlotResults] = useState({});
  const [currentTestingSlot, setCurrentTestingSlot] = useState(null);
  const consecutivePassesRef = useRef(0);

  const startRobotSimulation = async () => {
    if (!robotConnected) {
      alert("Robot is not connected!");
      return;
    }
    // Clear previous results on start
    setSlotResults({});
    setCurrentTestingSlot(null);
    try {
      const res = await fetch('/api/robot/start', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        alert("Failed to start robot: " + err.error);
      }
    } catch (e) {
      alert("Error contacting server");
    }
  };

  const handleStartStop = () => {
    if (isTesting) {
      // Manual stop
      setIsTesting(false);
      setProgress(0);
      setResult(null);
      setIsClosed(false);
      setCurrentTestingSlot(null);
    } else {
      if (!isClosed) {
        alert("Please close the lid before starting the test.");
        return;
      }
      // Start test
      setIsTesting(true);
      setProgress(0);
      setResult(null);
    }
  };

  useEffect(() => {
    // Listen for robot events
    const evtSource = new EventSource('/api/robot/sse');
    
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'connected') {
          setRobotConnected(true);
        } else if (data.event === 'disconnected') {
          setRobotConnected(false);
        } else if (data.event === 'lid_closed') {
          setIsClosed(true);
        } else if (data.event === 'test_started') {
          if (!isClosed) setIsClosed(true); // Ensure lid is closed before testing
          setIsTesting(true);
          setProgress(0);
          setResult(null);
          setCurrentTestingSlot(data.slot);
        } else if (data.event === 'batch_started') {
          setIsBatchRunning(true);
        } else if (data.event === 'batch_completed') {
          setIsBatchRunning(false);
        }
      } catch (e) {
        console.error("Failed to parse SSE", e);
      }
    };

    return () => {
      evtSource.close();
    };
  }, [isClosed]);

  useEffect(() => {
    let interval;
    if (isTesting && progress < 100) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 2; // Increments by 2% every 100ms (5 seconds total)
        });
      }, 100);
    } else if (isTesting && progress >= 100) {
      // Test finished
      setIsTesting(false);
      // Random pass/fail for simulation (80% chance of pass), but max 2 consecutive passes
      let testResult = Math.random() > 0.2 ? 'pass' : 'fail';
      
      if (consecutivePassesRef.current >= 2) {
        testResult = 'fail';
      }

      if (testResult === 'pass') {
        consecutivePassesRef.current += 1;
      } else {
        consecutivePassesRef.current = 0;
      }
      
      setResult(testResult);
      
      // Update the tray UI
      if (currentTestingSlot) {
        setSlotResults(prev => ({ ...prev, [currentTestingSlot]: testResult }));
      }
      
      // Notify backend of the result so it can instruct the robot
      if (robotConnected) {
        fetch('/api/robot/result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: testResult })
        }).catch(err => console.error("Failed to send result to robot:", err));
      }

      // Automatically open lid after test finishes
      setTimeout(() => {
        setIsClosed(false);
      }, 1000); // Wait 1 second before opening so user sees the result first
    }

    return () => clearInterval(interval);
  }, [isTesting, progress]);

  // Determine LED status
  let ledClass = 'idle';
  if (isTesting) {
    ledClass = 'testing';
  } else if (result === 'pass') {
    ledClass = 'pass';
  } else if (result === 'fail') {
    ledClass = 'fail';
  }

  return (
    <div className="proofmaster-container">
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '50px', flexWrap: 'wrap' }}>
        <div className="proofmaster-device">
          
          {/* Left Side: Chamber */}
          <div className="proofmaster-chamber-side">
            {/* Lid and hinge */}
            <div className="chamber-lid-hinge"></div>
            <div 
              className={`chamber-lid ${isClosed ? 'closed' : ''}`}
              onClick={() => !isTesting && setIsClosed(!isClosed)}
              title="Click to toggle lid"
            >
              <div className="lid-front-curve"></div>
              <div className="lid-latch"></div>
            </div>

            <div className="chamber-opening">
              {/* The descending seal mechanism */}
              <div className={`chamber-piston ${isTesting ? 'testing' : ''}`}></div>
              
              {/* The watch on the holder */}
              <div className="chamber-watch-holder"></div>
              <div className="chamber-watch">
                <div className="watch-dial">
                  <div className="watch-hand" style={{ transform: `rotate(${progress * 3.6}deg)` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Control Panel */}
          <div className="proofmaster-control-side">
            <div className="screen-bezel">
              <div className="screen-display">
                {!isTesting && result === null && (
                  <div className="screen-menu">
                    <div className="menu-item">Air Test Program</div>
                    <div className="menu-item">Custom Program</div>
                    <div className="menu-item">Quick Test</div>
                    <div className="menu-item">Configuration</div>
                  </div>
                )}
                
                {(isTesting || result !== null) && (
                  <div className="testing-view">
                    <h3>Air Test Program</h3>
                    <div className="progress-bar-container">
                      <div 
                        className="progress-bar-fill" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <div>{progress}%</div>
                    
                    {result === 'pass' && (
                      <div className="test-result result-pass">PASS</div>
                    )}
                    {result === 'fail' && (
                      <div className="test-result result-fail">FAIL</div>
                    )}
                  </div>
                )}
                
              </div>
            </div>
            
            <div className="brand-text">PROOFMASTER M</div>

            <div className="controls-area">
              <div className="signal-group">
                <div className={`signal-led ${ledClass}`}></div>
                <div className="signal-label">signal</div>
              </div>

              <div className="start-stop-group">
                <div className="start-button" onClick={handleStartStop}></div>
                <div className="start-label">start/stop</div>
              </div>
            </div>

            <div className="witschi-logo">witschi<span>®</span></div>
          </div>
        </div>
        
      {/* Custom Robotic Integration Side Panel */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Tray UI */}
        <div style={{ 
          background: '#1e1e1e', 
          border: '4px solid #111', 
          borderRadius: '12px', 
          padding: '20px', 
          width: '280px',
          boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8), 0 10px 20px rgba(0,0,0,0.5)'
        }}>
          <h4 style={{ color: '#aaa', margin: '0 0 15px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Testing Tray</h4>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '10px' 
          }}>
            {[
              { id: 1 }, { id: 2 },
              { id: 4 }, { id: 3 },
              { id: 5 }, { id: 6 },
              { id: 8 }, { id: 7 }
            ].map(slot => {
              let bg = '#222';
              let border = '2px solid #333';
              let shadow = 'none';
              
              if (slotResults[slot.id] === 'pass') {
                bg = 'rgba(76, 175, 80, 0.15)';
                border = '2px solid #4CAF50';
                shadow = '0 0 12px rgba(76, 175, 80, 0.6)';
              } else if (slotResults[slot.id] === 'fail') {
                bg = 'rgba(244, 67, 54, 0.15)';
                border = '2px solid #F44336';
                shadow = '0 0 12px rgba(244, 67, 54, 0.6)';
              }

              return (
                <div key={slot.id} style={{
                  height: '80px',
                  background: bg,
                  border: border,
                  boxShadow: shadow,
                  borderRadius: '6px',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}>
                  <span style={{ 
                    position: 'absolute', 
                    top: '4px', 
                    left: '6px', 
                    color: '#888', 
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}>
                    {slot.id}
                  </span>
                  
                  {/* Virtual Watch UI */}
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Top Strap */}
                    <div style={{ width: '12px', height: '10px', background: '#333', borderTopLeftRadius: '2px', borderTopRightRadius: '2px' }}></div>
                    {/* Dial */}
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      border: '3px solid silver',
                      background: 'radial-gradient(circle, #222 40%, #111 100%)',
                      boxShadow: 'inset 0 0 6px rgba(0,0,0,0.8), 0 3px 6px rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      zIndex: 2
                    }}>
                      {/* Hands */}
                      <div style={{ width: '2px', height: '10px', background: '#ffd700', position: 'absolute', bottom: '50%', transformOrigin: 'bottom', transform: 'rotate(45deg)' }}></div>
                      <div style={{ width: '2px', height: '14px', background: '#ffd700', position: 'absolute', bottom: '50%', transformOrigin: 'bottom', transform: 'rotate(0deg)' }}></div>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff', zIndex: 3 }}></div>
                    </div>
                    {/* Bottom Strap */}
                    <div style={{ width: '12px', height: '10px', background: '#333', borderBottomLeftRadius: '2px', borderBottomRightRadius: '2px' }}></div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        <button 
          onClick={startRobotSimulation} 
          disabled={!robotConnected || isBatchRunning}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            background: robotConnected ? (isBatchRunning ? '#555' : '#4CAF50') : '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: robotConnected && !isBatchRunning ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontFamily: 'Roboto, sans-serif',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            transition: 'background 0.3s'
          }}
        >
          {robotConnected ? (isBatchRunning ? 'Batch Running...' : '▶ Start Robotic Batch (4)') : '⚠ Robot Disconnected'}
        </button>
      </div>
      </div>
    </div>
  );
};

export default ProofmasterTwin;
