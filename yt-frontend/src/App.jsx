import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [keyword, setKeyword] = useState('')
  const [targetEmails, setTargetEmails] = useState(100)
  const [country, setCountry] = useState('United States')
  const [jobs, setJobs] = useState([])
  const [currentJob, setCurrentJob] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const BACKEND_URL = 'http://localhost:3000'

  // Start a new scraping job
  const handleStartScraping = async (e) => {
    e.preventDefault()
    
    if (!keyword.trim()) {
      setError('Please enter a keyword')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${BACKEND_URL}/api/scraper/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: keyword.trim(),
          targetEmails: parseInt(targetEmails),
          country: country || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to start job: ${response.statusText}`)
      }

      const data = await response.json()
      const jobId = data.jobId

      setCurrentJob({
        id: jobId,
        keyword: keyword.trim(),
        targetEmails: parseInt(targetEmails),
        country: country,
        status: 'starting',
        progress: {
          queriesExecuted: 0,
          channelsDiscovered: 0,
          channelsScraped: 0,
          emailsFound: 0,
          uniqueEmails: 0,
          percentComplete: 0,
        },
        emails: [],
        createdAt: new Date(),
      })

      setJobs([...jobs, jobId])
      setKeyword('')
      setError('')

      // Start monitoring the job
      monitorJob(jobId)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // Monitor job progress
  const monitorJob = async (jobId) => {
    try {
      const interval = setInterval(async () => {
        const response = await fetch(`${BACKEND_URL}/api/scraper/jobs/${jobId}`)
        if (!response.ok) return

        const data = await response.json()
        const job = data.job

        setCurrentJob(prev => ({
          ...prev,
          status: job.status,
          progress: job.progress,
          emails: job.emails || [],
        }))

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(interval)
          setLoading(false)
        }
      }, 5000) // Check every 5 seconds

      return () => clearInterval(interval)
    } catch (err) {
      console.error('Error monitoring job:', err)
      setLoading(false)
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🎯 YouTube Email Scraper</h1>
        <p>Extract emails and channels from YouTube using AI-powered keyword search</p>
      </header>

      <main className="app-main">
        {/* Input Form */}
        <section className="form-section">
          <div className="form-container">
            <h2>Start New Scraping Job</h2>
            
            {error && <div className="error-message">{error}</div>}
            
            <form onSubmit={handleStartScraping}>
              <div className="form-group">
                <label htmlFor="keyword">Keyword *</label>
                <input
                  id="keyword"
                  type="text"
                  placeholder="e.g., digital marketing agencies"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="targetEmails">Target Emails</label>
                  <input
                    id="targetEmails"
                    type="number"
                    min="10"
                    max="5000"
                    step="50"
                    value={targetEmails}
                    onChange={(e) => setTargetEmails(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="country">Country</label>
                  <input
                    id="country"
                    type="text"
                    placeholder="e.g., United States"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? '⏳ Scraping...' : '🚀 Start Scraping'}
              </button>
            </form>
          </div>
        </section>

        {/* Current Job Progress */}
        {currentJob && (
          <section className="progress-section">
            <div className="progress-container">
              <h2>📊 Scraping Progress</h2>
              
              <div className="job-info">
                <div className="info-item">
                  <span className="label">Keyword:</span>
                  <span className="value">{currentJob.keyword}</span>
                </div>
                <div className="info-item">
                  <span className="label">Target:</span>
                  <span className="value">{currentJob.targetEmails} emails</span>
                </div>
                <div className="info-item">
                  <span className="label">Status:</span>
                  <span className={`status status-${currentJob.status}`}>
                    {currentJob.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${Math.min(currentJob.progress.percentComplete, 100)}%` }}
                  />
                </div>
                <div className="progress-text">
                  {Math.min(currentJob.progress.percentComplete, 100)}% Complete
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{currentJob.progress.queriesExecuted}</div>
                  <div className="stat-label">Queries Executed</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currentJob.progress.channelsDiscovered}</div>
                  <div className="stat-label">Channels Discovered</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currentJob.progress.channelsScraped}</div>
                  <div className="stat-label">Channels Scraped</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currentJob.progress.emailsFound}</div>
                  <div className="stat-label">Emails Found</div>
                </div>
                <div className="stat-card highlight">
                  <div className="stat-value">{currentJob.progress.uniqueEmails}</div>
                  <div className="stat-label">Unique Emails</div>
                </div>
              </div>

              {currentJob.progress.uniqueEmails > 0 && (
                <div className="emails-section">
                  <h3>📧 Extracted Emails ({currentJob.emails?.length || 0})</h3>
                  <div className="emails-list">
                    {currentJob.emails?.slice(0, 10).map((email, idx) => (
                      <div key={idx} className="email-item">
                        <span className="email-address">{email.email || email}</span>
                        <span className="email-source">{email.source || 'unknown'}</span>
                      </div>
                    ))}
                    {currentJob.emails?.length > 10 && (
                      <div className="email-item-count">
                        ... and {currentJob.emails.length - 10} more emails
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Job History */}
        {jobs.length > 0 && (
          <section className="history-section">
            <h2>📋 Job History</h2>
            <div className="jobs-list">
              {jobs.map((jobId, idx) => (
                <div key={idx} className="job-item">
                  <span className="job-id">{jobId.substring(0, 12)}...</span>
                  <span className="job-time">ID: {jobId}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>Backend running on {BACKEND_URL}</p>
      </footer>
    </div>
  )
}

export default App
