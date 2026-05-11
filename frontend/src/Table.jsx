import { useState, useEffect } from 'react';

const Table = () => {
  const [channels, setChannels] = useState([]);
  const [filteredChannels, setFilteredChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); 
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [subscriberRange, setSubscriberRange] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [hasEmail, setHasEmail] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/channels');
        if (!response.ok) {
          throw new Error('Failed to fetch channels');
        }
        const data = await response.json();
        setChannels(data.channels || []);
        setFilteredChannels(data.channels || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, []);

  // Get unique countries for filter dropdown
  const countries = ['all', ...new Set(channels.map(c => c.country).filter(Boolean))];

  // Apply filters
  useEffect(() => {
    let result = [...channels];

    // Search filter
    if (searchTerm) {
      result = result.filter(channel => 
        channel.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        channel.emails?.some(email => email.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Country filter
    if (selectedCountry !== 'all') {
      result = result.filter(channel => channel.country === selectedCountry);
    }

    // Email filter
    if (hasEmail === 'with') {
      result = result.filter(channel => channel.emails && channel.emails.length > 0);
    } else if (hasEmail === 'without') {
      result = result.filter(channel => !channel.emails || channel.emails.length === 0);
    }

    // Subscriber range filter
    if (subscriberRange !== 'all') {
      result = result.filter(channel => {
        const subs = channel.subscriberCount || 0;
        switch(subscriberRange) {
          case '0-1k': return subs < 1000;
          case '1k-10k': return subs >= 1000 && subs < 10000;
          case '10k-100k': return subs >= 10000 && subs < 100000;
          case '100k-1m': return subs >= 100000 && subs < 1000000;
          case '1m+': return subs >= 1000000;
          default: return true;
        }
      });
    }

    // Sorting
    switch(sortBy) {
      case 'recent':
        result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        break;
      case 'subscribers_high':
        result.sort((a, b) => (b.subscriberCount || 0) - (a.subscriberCount || 0));
        break;
      case 'subscribers_low':
        result.sort((a, b) => (a.subscriberCount || 0) - (b.subscriberCount || 0));
        break;
      case 'videos_high':
        result.sort((a, b) => (b.videoCount || 0) - (a.videoCount || 0));
        break;
      case 'quality_high':
        result.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
        break;
      case 'name_asc':
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      default:
        break;
    }

    setFilteredChannels(result);
  }, [channels, searchTerm, selectedCountry, subscriberRange, sortBy, hasEmail]);

  const getQualityBadge = (score) => {
    if (!score) return null;
    if (score >= 80) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">High</span>;
    if (score >= 50) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Medium</span>;
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Low</span>;
  };

  const getSubscriberBadge = (count) => {
    if (count >= 1000000) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800">🌟 1M+</span>;
    if (count >= 100000) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">💎 100K+</span>;
    if (count >= 10000) return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">⭐ 10K+</span>;
    return null;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-lg text-gray-600">Loading channels...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div className="text-red-600 font-medium">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            YouTube Channels Directory
          </h1>
          <p className="text-gray-600">Discover and connect with content creators</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                <input
                  type="text"
                  placeholder="Search by channel name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Quick Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2 font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
              </svg>
              Filters
              <span className="ml-2 bg-white bg-opacity-20 px-2 py-0.5 rounded-full text-sm">
                {filteredChannels.length}
              </span>
            </button>
          </div>

          {/* Extended Filters */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200">
              {/* Country Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {countries.map(country => (
                    <option key={country} value={country}>
                      {country === 'all' ? 'All Countries' : country}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subscriber Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subscribers</label>
                <select
                  value={subscriberRange}
                  onChange={(e) => setSubscriberRange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Sizes</option>
                  <option value="0-1k">0 - 1K</option>
                  <option value="1k-10k">1K - 10K</option>
                  <option value="10k-100k">10K - 100K</option>
                  <option value="100k-1m">100K - 1M</option>
                  <option value="1m+">1M+</option>
                </select>
              </div>

              {/* Email Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Status</label>
                <select
                  value={hasEmail}
                  onChange={(e) => setHasEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Channels</option>
                  <option value="with">With Email</option>
                  <option value="without">Without Email</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="recent">Recently Added</option>
                  <option value="subscribers_high">Subscribers (High to Low)</option>
                  <option value="subscribers_low">Subscribers (Low to High)</option>
                  <option value="videos_high">Most Videos</option>
                  <option value="quality_high">Highest Quality Score</option>
                  <option value="name_asc">Channel Name (A-Z)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="mb-4 flex justify-between items-center">
          <div className="text-gray-600">
            Showing <span className="font-semibold text-gray-800">{filteredChannels.length}</span> of{' '}
            <span className="font-semibold text-gray-800">{channels.length}</span> channels
          </div>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCountry('all');
              setSubscriberRange('all');
              setSortBy('recent');
              setHasEmail('all');
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear all filters
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Channel
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Stats
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Contact Info
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Links
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Quality
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredChannels.map((channel) => (
                  <tr key={channel._id} className="hover:bg-blue-50 transition-colors duration-150">
                    <td className="px-6 py-4">
                      <div className="flex items-start space-y-1 flex-col">
                        <a
                          href={`https://www.youtube.com/channel/${channel.channelId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-2"
                        >
                          {channel.title || 'Untitled Channel'}
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path>
                            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path>
                          </svg>
                        </a>
                        {getSubscriberBadge(channel.subscriberCount)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                          </svg>
                          <span className="text-sm font-medium text-gray-900">
                            {channel.subscriberCount?.toLocaleString() || 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                          </svg>
                          <span className="text-sm text-gray-900">{channel.videoCount || 'N/A'} videos</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {channel.emails && channel.emails.length > 0 ? (
                        <div className="space-y-1">
                          {channel.emails.map((email, index) => (
                            <a
                              key={index}
                              href={`mailto:${email}`}
                              className="text-green-600 hover:text-green-700 text-sm hover:underline flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                              </svg>
                              {email}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">No email available</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {channel.websiteUrl && (
                          <a
                            href={channel.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 text-sm hover:underline flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"></path>
                            </svg>
                            Website
                          </a>
                        )}
                        {channel.socialLinks && channel.socialLinks.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {channel.socialLinks.slice(0, 3).map((link, index) => (
                              <a
                                key={index}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-md hover:bg-purple-100"
                              >
                                {link.platform}
                              </a>
                            ))}
                            {channel.socialLinks.length > 3 && (
                              <span className="text-xs text-gray-500">+{channel.socialLinks.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {channel.qualityScore ? `${channel.qualityScore}/100` : 'N/A'}
                        </span>
                        {getQualityBadge(channel.qualityScore)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {channel.country ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {channel.country}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredChannels.length === 0 && (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No channels found</h3>
              <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or search terms.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Table;