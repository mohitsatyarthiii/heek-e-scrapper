import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [keywords, setKeywords] = useState('');
  const [maxProfiles, setMaxProfiles] = useState(50);
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalKeywords: 0,
    completedKeywords: 0,
    totalProfilesFound: 0,
    totalProfilesScraped: 0,
    totalEmailsFound: 0,
    startTime: null,
    endTime: null
  });
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedKeyword, setSelectedKeyword] = useState('all');

  // Fetch status and logs periodically
  useEffect(() => {
    if (!autoRefresh) return;

    const fetchData = async () => {
      try {
        const [statusRes, logsRes, profilesRes] = await Promise.all([
          fetch('http://localhost:5001/api/status'),
          fetch('http://localhost:5001/api/logs?limit=50'),
          fetch(`http://localhost:5001/api/profiles?limit=100&keyword=${selectedKeyword !== 'all' ? selectedKeyword : ''}`)
        ]);

        const statusData = await statusRes.json();
        const logsData = await logsRes.json();
        const profilesData = await profilesRes.json();

        setIsScraping(statusData.isScraping);
        setStats(statusData.stats);
        setLogs(logsData.logs || []);
        setProfiles(profilesData.profiles || []);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to connect to server. Make sure the backend is running.');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedKeyword]);

  const handleStartScraping = async (e) => {
    e.preventDefault();
    
    if (!keywords.trim()) {
      setError('Please enter at least one keyword');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const keywordList = keywords.split(',').map(k => k.trim()).filter(Boolean);
      
      const response = await fetch('http://localhost:5001/api/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keywords: keywordList,
          maxProfiles: maxProfiles
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start scraper');
      }

      // Clear form and show success
      setKeywords('');
      setError(null);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStopScraping = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/stop', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop scraper');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteProfiles = async () => {
    if (!window.confirm('Are you sure you want to delete all profiles?')) return;

    try {
      const response = await fetch(`http://localhost:5001/api/profiles?keyword=${selectedKeyword !== 'all' ? selectedKeyword : ''}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete profiles');
      }

      // Refresh profiles
      const profilesRes = await fetch(`http://localhost:5001/api/profiles?limit=100&keyword=${selectedKeyword !== 'all' ? selectedKeyword : ''}`);
      const profilesData = await profilesRes.json();
      setProfiles(profilesData.profiles || []);
      
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getUniqueKeywords = () => {
    const keywords = profiles.map(p => p.keyword).filter(Boolean);
    return ['all', ...new Set(keywords)];
  };

  const getLogColor = (level) => {
    switch (level) {
      case 'error': return 'log-error';
      case 'warning': return 'log-warning';
      case 'success': return 'log-success';
      case 'info': return 'log-info';
      default: return '';
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>📸 Instagram Profile Scraper</h1>
        <p>Search and extract emails from Instagram profiles</p>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
            <button onClick={() => setError(null)} className="close-btn">×</button>
          </div>
        )}

        {/* Control Panel */}
        <section className="control-panel">
          <h2>🎮 Control Panel</h2>
          
          <form onSubmit={handleStartScraping} className="scraper-form">
            <div className="form-group">
              <label htmlFor="keywords">Keywords (comma-separated):</label>
              <textarea
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., marketing agency, web developers, digital artists"
                rows="3"
                disabled={isScraping || loading}
              />
              <small>Enter keywords to search for Instagram profiles</small>
            </div>

            <div className="form-group">
              <label htmlFor="maxProfiles">Max profiles per keyword:</label>
              <input
                type="number"
                id="maxProfiles"
                value={maxProfiles}
                onChange={(e) => setMaxProfiles(parseInt(e.target.value) || 10)}
                min="1"
                max="200"
                disabled={isScraping || loading}
              />
            </div>

            <div className="form-actions">
              {!isScraping ? (
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading || !keywords.trim()}
                >
                  {loading ? 'Starting...' : '🚀 Start Scraping'}
                </button>
              ) : (
                <button 
                  type="button" 
                  className="btn btn-danger"
                  onClick={handleStopScraping}
                >
                  ⏹️ Stop Scraping
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Stats Dashboard */}
        <section className="stats-panel">
          <h2>📊 Scraping Statistics</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalKeywords || 0}</div>
              <div className="stat-label">Total Keywords</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-value">{stats.completedKeywords || 0}</div>
              <div className="stat-label">Completed</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-value">{stats.totalProfilesFound || 0}</div>
              <div className="stat-label">Profiles Found</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-value">{stats.totalProfilesScraped || 0}</div>
              <div className="stat-label">Profiles Scraped</div>
            </div>
            
            <div className="stat-card highlight">
              <div className="stat-value">{stats.totalEmailsFound || 0}</div>
              <div className="stat-label">📧 Emails Found</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-value">
                {stats.startTime ? formatDate(stats.startTime) : 'Not started'}
              </div>
              <div className="stat-label">Start Time</div>
            </div>
          </div>

          {isScraping && (
            <div className="scraping-indicator">
              <div className="spinner"></div>
              <span>Scraping in progress...</span>
            </div>
          )}
        </section>

        {/* Real-time Logs */}
        <section className="logs-panel">
          <div className="panel-header">
            <h2>📋 Real-time Logs</h2>
            <label className="auto-refresh-toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </div>

          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="no-logs">No logs yet. Start scraping to see activity.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`log-entry ${getLogColor(log.level)}`}>
                  <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="log-level">{log.level.toUpperCase()}</span>
                  {log.keyword && <span className="log-keyword">[{log.keyword}]</span>}
                  <span className="log-message">{log.message}</span>
                  {log.url && (
                    <a href={log.url} target="_blank" rel="noopener noreferrer" className="log-url">
                      🔗
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Profiles Table */}
        <section className="profiles-panel">
          <div className="panel-header">
            <h2>📇 Scraped Profiles ({profiles.length})</h2>
            
            <div className="panel-controls">
              <select 
                value={selectedKeyword} 
                onChange={(e) => setSelectedKeyword(e.target.value)}
                className="keyword-filter"
              >
                {getUniqueKeywords().map(keyword => (
                  <option key={keyword} value={keyword}>
                    {keyword === 'all' ? 'All Keywords' : keyword}
                  </option>
                ))}
              </select>

              <button 
                onClick={handleDeleteProfiles}
                className="btn btn-danger btn-small"
                disabled={profiles.length === 0}
              >
                🗑️ Delete {selectedKeyword !== 'all' ? 'Filtered' : 'All'}
              </button>
            </div>
          </div>

          {profiles.length === 0 ? (
            <div className="no-profiles">No profiles scraped yet.</div>
          ) : (
            <div className="table-container">
              <table className="profiles-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Name</th>
                    <th>📧 Emails</th>
                    <th>📞 Phones</th>
                    <th>Website</th>
                    <th>Keyword</th>
                    <th>Scraped At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile._id || profile.profileUrl}>
                      <td>
                        <a 
                          href={profile.profileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="profile-link"
                        >
                          @{profile.username || 'N/A'}
                        </a>
                      </td>
                      <td>{profile.name || 'N/A'}</td>
                      <td>
                        {profile.emails && profile.emails.length > 0 ? (
                          <div className="email-list">
                            {profile.emails.map((email, i) => (
                              <span key={i} className="email-tag">{email}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                      <td>
                        {profile.phones && profile.phones.length > 0 ? (
                          <div className="phone-list">
                            {profile.phones.map((phone, i) => (
                              <span key={i} className="phone-tag">{phone}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                      <td>
                        {profile.website ? (
                          <a 
                            href={profile.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="website-link"
                          >
                            🌐 Link
                          </a>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                      <td>
                        <span className="keyword-tag">{profile.keyword || 'N/A'}</span>
                      </td>
                      <td>{formatDate(profile.scrapedAt)}</td>
                      <td>
                        <button 
                          className="btn-view"
                          onClick={() => window.open(profile.profileUrl, '_blank')}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;