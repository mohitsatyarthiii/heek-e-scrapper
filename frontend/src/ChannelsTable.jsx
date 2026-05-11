// ChannelsTable.jsx
import React, { useState, useEffect, useCallback } from 'react';

const ChannelsTable = () => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  
  // Filters and pagination state
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [emailFilter, setEmailFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalChannels, setTotalChannels] = useState(0);
  const [limit, setLimit] = useState(50);

  // Fetch channels from backend
  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: limit,
        sort: sortOrder,
        search: searchTerm,
        hasEmail: emailFilter
      });
      
      const response = await fetch(`http://localhost:3001/api/channels?${params}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setChannels(result.data.channels);
        setTotalPages(result.data.pagination.totalPages);
        setTotalChannels(result.data.pagination.totalChannels);
      } else {
        throw new Error(result.error || 'Failed to fetch channels');
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching channels:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, sortOrder, searchTerm, emailFilter]);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/stats');
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    fetchStats();
  }, [fetchChannels, fetchStats]);

  // Format subscriber count
  const formatSubscribers = (count) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Handle sort toggle
  const toggleSort = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Handle search with debounce
  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Handle email filter change
  const handleEmailFilter = (value) => {
    setEmailFilter(value);
    setCurrentPage(1);
  };

  // Handle limit change
  const handleLimitChange = (value) => {
    setLimit(Number(value));
    setCurrentPage(1);
  };

  // Pagination handler
  const goToPage = (page) => {
    setCurrentPage(page);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>📊 YouTube Channels Database</h1>
        <p style={styles.subtitle}>Clean & Deduplicated Channel Data</p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.totalChannels.toLocaleString()}</div>
            <div style={styles.statLabel}>Total Channels</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.channelsWithEmail.toLocaleString()}</div>
            <div style={styles.statLabel}>With Email</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.emailPercentage}%</div>
            <div style={styles.statLabel}>Email Rate</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.averageSubscribers.toLocaleString()}</div>
            <div style={styles.statLabel}>Avg Subscribers</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Search channel name..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            style={styles.searchInput}
          />

          {/* Email Filter */}
          <select
            value={emailFilter}
            onChange={(e) => handleEmailFilter(e.target.value)}
            style={styles.select}
          >
            <option value="all">All Channels</option>
            <option value="yes">With Email</option>
            <option value="no">Without Email</option>
          </select>

          {/* Sort Button */}
          <button onClick={toggleSort} style={styles.sortButton}>
            📈 Subscribers {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>

        <div style={styles.controlGroup}>
          {/* Items per page */}
          <select
            value={limit}
            onChange={(e) => handleLimitChange(e.target.value)}
            style={styles.select}
          >
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
          </select>

          {/* Total count */}
          <span style={styles.totalCount}>
            Total: {totalChannels.toLocaleString()} channels
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={styles.error}>
          ❌ Error: {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>Loading channels...</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Channel Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th} onClick={toggleSort} className="sortable">
                    Subscribers {sortOrder === 'desc' ? '↓' : '↑'}
                  </th>
                  <th style={styles.th}>Channel ID</th>
                </tr>
              </thead>
              <tbody>
                {channels.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={styles.emptyState}>
                      No channels found matching your criteria
                    </td>
                  </tr>
                ) : (
                  channels.map((channel, index) => (
                    <tr
                      key={channel.id}
                      style={{
                        ...styles.tableRow,
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa'
                      }}
                    >
                      <td style={styles.td}>
                        {(currentPage - 1) * limit + index + 1}
                      </td>
                      <td style={styles.channelName}>
                        {channel.channelName}
                      </td>
                      <td style={styles.td}>
                        {channel.primaryEmail !== 'No email' ? (
                          <a href={`mailto:${channel.primaryEmail}`} style={styles.emailLink}>
                            {channel.primaryEmail}
                          </a>
                        ) : (
                          <span style={styles.noEmail}>No email</span>
                        )}
                        {channel.emailCount > 1 && (
                          <span style={styles.emailBadge}>+{channel.emailCount - 1}</span>
                        )}
                      </td>
                      <td style={styles.subscriberCell}>
                        <span style={styles.subscriberCount}>
                          {formatSubscribers(channel.subscriberCount)}
                        </span>
                      </td>
                      <td style={styles.channelId}>
                        {channel.channelId}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  ...styles.pageButton,
                  opacity: currentPage === 1 ? 0.5 : 1
                }}
              >
                ← Previous
              </button>

              <div style={styles.pageNumbers}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      style={{
                        ...styles.pageNumber,
                        backgroundColor: currentPage === pageNum ? '#007bff' : 'transparent',
                        color: currentPage === pageNum ? 'white' : '#007bff'
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  ...styles.pageButton,
                  opacity: currentPage === totalPages ? 0.5 : 1
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Styles
const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '32px',
    color: '#1a1a1a',
    marginBottom: '10px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  },
  statCard: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    borderRadius: '10px',
    color: 'white',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '5px',
  },
  statLabel: {
    fontSize: '14px',
    opacity: 0.9,
  },
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '15px',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  controlGroup: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchInput: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    width: '250px',
    outline: 'none',
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
    outline: 'none',
  },
  sortButton: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  totalCount: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500',
  },
  tableWrapper: {
    overflowX: 'auto',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'white',
    fontSize: '14px',
  },
  tableHeader: {
    backgroundColor: '#2c3e50',
    color: 'white',
  },
  th: {
    padding: '12px 15px',
    textAlign: 'left',
    fontWeight: '600',
    borderBottom: '2px solid #ddd',
  },
  tableRow: {
    transition: 'background-color 0.2s',
  },
  td: {
    padding: '12px 15px',
    borderBottom: '1px solid #eee',
  },
  channelName: {
    padding: '12px 15px',
    borderBottom: '1px solid #eee',
    fontWeight: '500',
    color: '#2c3e50',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emailLink: {
    color: '#007bff',
    textDecoration: 'none',
    fontSize: '13px',
  },
  noEmail: {
    color: '#999',
    fontStyle: 'italic',
    fontSize: '13px',
  },
  emailBadge: {
    backgroundColor: '#28a745',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '11px',
    marginLeft: '6px',
  },
  subscriberCell: {
    padding: '12px 15px',
    borderBottom: '1px solid #eee',
  },
  subscriberCount: {
    fontWeight: '600',
    color: '#495057',
  },
  channelId: {
    padding: '12px 15px',
    borderBottom: '1px solid #eee',
    fontSize: '12px',
    color: '#666',
    fontFamily: 'monospace',
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#999',
    fontSize: '16px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
  },
  spinner: {
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #007bff',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 15px',
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '20px',
    border: '1px solid #f5c6cb',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '15px',
    marginTop: '20px',
    padding: '15px',
  },
  pageButton: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  pageNumbers: {
    display: 'flex',
    gap: '5px',
  },
  pageNumber: {
    padding: '8px 12px',
    border: '1px solid #007bff',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
};

export default ChannelsTable;