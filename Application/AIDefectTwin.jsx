import React, { useState, useEffect, useRef } from 'react';

export default function AIDefectTwin() {
  // states: 'checking' | 'starting' | 'online' | 'error'
  const [status, setStatus] = useState('checking');
  const [attempt, setAttempt] = useState(1);
  const [iframeKey, setIframeKey] = useState(Date.now());
  const [statusText, setStatusText] = useState('Checking AI Defect Studio status...');
  const [isRestarting, setIsRestarting] = useState(false);
  const pollIntervalRef = useRef(null);

  const getHost = () => window.location.hostname || 'localhost';
  const hubUrl = `http://${getHost()}:5000/?module=patchcore&t=${iframeKey}`;

  // Check if AI Hub on Port 5000 is reachable
  const checkHubHealth = async () => {
    try {
      const res = await fetch('/api/ai-hub/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.online) return true;
      }
    } catch (e) {
      // fallback to direct ping
    }
    try {
      const direct = await fetch(`http://${getHost()}:5000/api/health`, {
        method: 'GET',
        cache: 'no-store',
        mode: 'cors'
      });
      if (direct.ok) return true;
    } catch (e) {
      return false;
    }
    return false;
  };

  // Launch the Hub if offline, then poll until it answers
  const ensureHubRunning = async () => {
    setStatus('checking');
    setStatusText('Checking AI Defect Studio status...');

    const isOnline = await checkHubHealth();
    if (isOnline) {
      setStatus('online');
      return;
    }

    // Trigger smart launch
    setStatus('starting');
    setStatusText('Starting AI Defect Hub on Port 5000...');
    setAttempt(1);

    try {
      await fetch('/api/launch-ai-hub', { method: 'POST' });
    } catch (e) {
      console.warn("Failed to request launch-ai-hub:", e);
    }

    // Start polling
    let currentAttempt = 0;
    const maxAttempts = 35; // 35 * 1.5s = ~52 seconds max

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      currentAttempt++;
      setAttempt(currentAttempt);
      setStatusText(`Initializing AI Engine & Vision Models... (${currentAttempt}/${maxAttempts})`);

      const alive = await checkHubHealth();
      if (alive) {
        clearInterval(pollIntervalRef.current);
        setStatus('online');
      } else if (currentAttempt >= maxAttempts) {
        clearInterval(pollIntervalRef.current);
        setStatus('error');
        setStatusText('AI Engine startup timed out. Check the Python console or click Restart Engine.');
      }
    }, 1500);
  };

  useEffect(() => {
    ensureHubRunning();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Graceful reload without unmounting or crashing
  const handleReload = async () => {
    setStatusText('Verifying connection...');
    const alive = await checkHubHealth();
    if (alive) {
      setIframeKey(Date.now());
      setStatus('online');
    } else {
      ensureHubRunning();
    }
  };

  // Clean force restart of python processes and re-poll
  const handleRestart = async () => {
    if (!window.confirm("Restart the AI Engine? This will cleanly terminate hung Python processes on ports 5000 & 5003 and boot a fresh Hub.")) {
      return;
    }
    setIsRestarting(true);
    setStatus('starting');
    setStatusText('Stopping hung processes on ports 5000 & 5003...');

    try {
      await fetch('/api/ai-hub/restart', { method: 'POST' });
    } catch (err) {
      console.error("Restart failed:", err);
    }

    // Wait 2.5 seconds for socket release before polling
    setTimeout(() => {
      setIsRestarting(false);
      ensureHubRunning();
    }, 2500);
  };

  const handleOpenNewTab = () => {
    window.open(`http://${getHost()}:5000/?module=patchcore`, '_blank');
  };

  return (
    <div style={{
      width: '100%',
      backgroundColor: '#090b0e',
      border: '1px solid #333',
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Header Bar */}
      <div style={{
        background: 'rgba(23, 26, 31, 1)',
        padding: '12px 20px',
        borderBottom: '2px solid #dfc16d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Title and Status Dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: status === 'online' ? '#4CAF50' : (status === 'error' ? '#f44336' : '#dfc16d'),
            boxShadow: status === 'online' ? '0 0 10px #4CAF50' : (status === 'error' ? '0 0 10px #f44336' : '0 0 10px #dfc16d'),
            transition: 'background 0.3s'
          }} />
          <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontFamily: 'Roboto, sans-serif' }}>
            AI Defect Detection & Robot Orchestrator
          </h3>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '12px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            background: status === 'online' ? 'rgba(76, 175, 80, 0.15)' : (status === 'error' ? 'rgba(244, 67, 54, 0.15)' : 'rgba(223, 193, 109, 0.15)'),
            color: status === 'online' ? '#4CAF50' : (status === 'error' ? '#f44336' : '#dfc16d'),
            border: `1px solid ${status === 'online' ? '#4CAF50' : (status === 'error' ? '#f44336' : '#dfc16d')}`
          }}>
            {status === 'online' ? '● ONLINE' : (status === 'error' ? '● OFFLINE' : '● BOOTING...')}
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Reload View Button */}
          <button
            onClick={handleReload}
            disabled={status === 'starting' || isRestarting}
            title="Reload the AI Studio iframe"
            style={{
              background: 'rgba(223, 193, 109, 0.1)',
              border: '1px solid #dfc16d',
              color: '#dfc16d',
              padding: '6px 14px',
              borderRadius: '4px',
              cursor: (status === 'starting' || isRestarting) ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontFamily: 'Roboto, sans-serif',
              fontWeight: 'bold',
              transition: 'background 0.2s',
              opacity: (status === 'starting' || isRestarting) ? 0.5 : 1
            }}
            onMouseOver={(e) => { if (status !== 'starting') e.target.style.background = 'rgba(223, 193, 109, 0.25)'; }}
            onMouseOut={(e) => { e.target.style.background = 'rgba(223, 193, 109, 0.1)'; }}
          >
            ↻ RELOAD VIEW
          </button>

          {/* Force Restart Engine Button */}
          <button
            onClick={handleRestart}
            disabled={isRestarting}
            title="Cleanly terminate stuck Python processes and reboot the AI engine"
            style={{
              background: 'rgba(244, 67, 54, 0.15)',
              border: '1px solid #f44336',
              color: '#ff7961',
              padding: '6px 14px',
              borderRadius: '4px',
              cursor: isRestarting ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontFamily: 'Roboto, sans-serif',
              fontWeight: 'bold',
              transition: 'background 0.2s',
              opacity: isRestarting ? 0.5 : 1
            }}
            onMouseOver={(e) => { if (!isRestarting) e.target.style.background = 'rgba(244, 67, 54, 0.3)'; }}
            onMouseOut={(e) => { e.target.style.background = 'rgba(244, 67, 54, 0.15)'; }}
          >
            ⚡ RESTART ENGINE
          </button>

          {/* Open in New Tab Button */}
          <button
            onClick={handleOpenNewTab}
            title="Open AI Studio in a full separate tab"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid #666',
              color: '#ddd',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'Roboto, sans-serif',
              fontWeight: 'bold',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => { e.target.style.background = 'rgba(255, 255, 255, 0.18)'; }}
            onMouseOut={(e) => { e.target.style.background = 'rgba(255, 255, 255, 0.08)'; }}
          >
            ↗ OPEN TAB
          </button>

          <span style={{ color: '#888', fontSize: '12px', fontFamily: 'monospace', marginLeft: '5px' }}>
            PORT: 5000
          </span>
        </div>
      </div>

      {/* Main View Area */}
      <div style={{
        width: '100%',
        height: '820px',
        backgroundColor: '#090b0e',
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {/* State: Checking or Starting */}
        {(status === 'checking' || status === 'starting') && (
          <div style={{ textAlign: 'center', color: '#dfc16d', fontFamily: 'Roboto, sans-serif', padding: '20px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              border: '4px solid rgba(223, 193, 109, 0.2)',
              borderTop: '4px solid #dfc16d',
              borderRadius: '50%',
              margin: '0 auto 20px auto',
              animation: 'spin 1s linear infinite'
            }} />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 'bold' }}>
              {status === 'checking' ? 'Connecting to AI Engine...' : 'Booting AI Engine...'}
            </h2>
            <p style={{ color: '#aaa', margin: '0 0 16px 0', fontSize: '14px' }}>
              {statusText}
            </p>
            {status === 'starting' && (
              <div style={{
                width: '260px',
                height: '6px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '3px',
                margin: '0 auto',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (attempt / 35) * 100)}%`,
                  background: '#dfc16d',
                  transition: 'width 0.5s ease-out'
                }} />
              </div>
            )}
          </div>
        )}

        {/* State: Error / Offline */}
        {status === 'error' && (
          <div style={{
            textAlign: 'center',
            color: '#fff',
            fontFamily: 'Roboto, sans-serif',
            maxWidth: '500px',
            padding: '30px',
            background: 'rgba(23, 26, 31, 0.95)',
            border: '1px solid #f44336',
            borderRadius: '8px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⚠️</div>
            <h2 style={{ color: '#ff7961', margin: '0 0 10px 0', fontSize: '20px' }}>
              AI Studio Not Responding
            </h2>
            <p style={{ color: '#bbb', fontSize: '14px', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              The Python backend on port 5000 did not respond in time. This can happen if a previous Python process hung or camera ports are occupied.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={handleRestart}
                style={{
                  background: '#f44336',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ⚡ Restart AI Engine
              </button>
              <button
                onClick={handleOpenNewTab}
                style={{
                  background: 'transparent',
                  color: '#dfc16d',
                  border: '1px solid #dfc16d',
                  padding: '10px 18px',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ↗ Open in Direct Tab
              </button>
            </div>
          </div>
        )}

        {/* State: Online - Iframe only mounted when confirmed alive! */}
        {status === 'online' && (
          <iframe
            key={iframeKey}
            src={hubUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="AI Defect Detection Studio"
          />
        )}
      </div>
    </div>
  );
}
