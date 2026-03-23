import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FiMail, FiGlobe, FiDownload, FiSearch, FiFilter, FiExternalLink, 
  FiUsers, FiVideo, FiStar, FiArrowLeft, FiCopy, FiCheck, FiEye, 
  FiCalendar, FiMapPin, FiLink, FiX, FiSliders, FiTrendingUp, 
  FiClock, FiAward, FiZap, FiBarChart2, FiRefreshCw, FiInfo,
  FiTwitter, FiInstagram, FiFacebook, FiLinkedin, FiYoutube,
  FiPhone, FiMessageSquare, FiShare2, FiHeart, FiThumbsUp,
  FiMenu, FiGrid, FiList
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const API_BASE_URL = 'https://api.heekentertainment.com/api';

export default function Creators() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [filters, setFilters] = useState({
    search: '',
    minSubscribers: '',
    maxSubscribers: '',
    minQuality: '',
    maxQuality: '',
    country: '',
    hasWebsite: false,
    hasSocial: false,
    hasPhone: false,
    dateRange: 'all',
    customStartDate: '',
    customEndDate: '',
    sortBy: 'qualityScore',
    sortOrder: 'desc',
  });
  const [countries, setCountries] = useState([]);
  const [copiedEmail, setCopiedEmail] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [activePreset, setActivePreset] = useState('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchChannels();
    fetchCountries();
  }, [page, filters]);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page,
        limit,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        ...(filters.search && { search: filters.search }),
        ...(filters.minSubscribers && { minSubscribers: filters.minSubscribers }),
        ...(filters.maxSubscribers && { maxSubscribers: filters.maxSubscribers }),
        ...(filters.minQuality && { minQuality: filters.minQuality }),
        ...(filters.maxQuality && { maxQuality: filters.maxQuality }),
        ...(filters.country && { country: filters.country }),
        ...(filters.hasWebsite && { hasWebsite: true }),
        ...(filters.hasSocial && { hasSocial: true }),
        ...(filters.hasPhone && { hasPhone: true }),
        ...(filters.dateRange !== 'all' && filters.dateRange !== 'custom' && { dateRange: filters.dateRange }),
        ...(filters.dateRange === 'custom' && filters.customStartDate && { startDate: filters.customStartDate }),
        ...(filters.dateRange === 'custom' && filters.customEndDate && { endDate: filters.customEndDate }),
      });
      
      const response = await fetch(`${API_BASE_URL}/channels?${params}`);
      const data = await response.json();
      
      setChannels(data.channels);
      setTotal(data.total);
    } catch (error) {
      console.error('Error fetching channels:', error);
      toast.error('Failed to fetch channels');
    } finally {
      setLoading(false);
    }
  };

  const fetchCountries = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/countries`);
      const data = await response.json();
      setCountries(data);
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  };

  const handleExport = async () => {
    try {
      toast.loading('Preparing export...', { id: 'export' });
      const params = new URLSearchParams({
        ...(filters.search && { search: filters.search }),
        ...(filters.minSubscribers && { minSubscribers: filters.minSubscribers }),
        ...(filters.maxSubscribers && { maxSubscribers: filters.maxSubscribers }),
        ...(filters.minQuality && { minQuality: filters.minQuality }),
        ...(filters.country && { country: filters.country }),
        ...(filters.hasWebsite && { hasWebsite: true }),
        ...(filters.hasSocial && { hasSocial: true }),
        ...(filters.dateRange !== 'all' && filters.dateRange !== 'custom' && { dateRange: filters.dateRange }),
      });
      
      const response = await fetch(`${API_BASE_URL}/export/channels?${params}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `creators-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Export completed!', { id: 'export' });
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Failed to export', { id: 'export' });
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    toast.success(`${type} copied!`);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const openChannelDetails = (channel) => {
    setSelectedChannel(channel);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedChannel(null), 300);
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getQualityBadge = (score) => {
    if (score >= 80) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (score >= 60) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (score >= 40) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getPlatformIcon = (platform) => {
    switch(platform.toLowerCase()) {
      case 'twitter': return <FiTwitter className="w-4 h-4" />;
      case 'instagram': return <FiInstagram className="w-4 h-4" />;
      case 'facebook': return <FiFacebook className="w-4 h-4" />;
      case 'linkedin': return <FiLinkedin className="w-4 h-4" />;
      case 'youtube': return <FiYoutube className="w-4 h-4" />;
      default: return <FiLink className="w-4 h-4" />;
    }
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      minSubscribers: '',
      maxSubscribers: '',
      minQuality: '',
      maxQuality: '',
      country: '',
      hasWebsite: false,
      hasSocial: false,
      hasPhone: false,
      dateRange: 'all',
      customStartDate: '',
      customEndDate: '',
      sortBy: 'qualityScore',
      sortOrder: 'desc',
    });
    setActivePreset('all');
    setPage(1);
    toast.success('Filters reset');
  };

  const applyPreset = (preset) => {
    setActivePreset(preset);
    switch(preset) {
      case 'recent':
        setFilters(prev => ({ ...prev, dateRange: 'week', sortBy: 'scrapedAt', sortOrder: 'desc' }));
        break;
      case 'top':
        setFilters(prev => ({ ...prev, minSubscribers: '100000', sortBy: 'subscriberCount', sortOrder: 'desc' }));
        break;
      case 'highQuality':
        setFilters(prev => ({ ...prev, minQuality: '80', sortBy: 'qualityScore', sortOrder: 'desc' }));
        break;
      case 'withEmails':
        setFilters(prev => ({ ...prev, minQuality: '50', sortBy: 'emails', sortOrder: 'desc' }));
        break;
      default:
        resetFilters();
    }
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  const dateRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'Last 7 Days' },
    { value: 'month', label: 'Last 30 Days' },
    { value: 'custom', label: 'Custom Range' },
  ];

  // Card View Component
  const CreatorCard = ({ channel }) => (
    <div 
      onClick={() => openChannelDetails(channel)}
      className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3 mb-3">
        {channel.thumbnailUrl && (
          <img src={channel.thumbnailUrl} alt="" className="w-14 h-14 rounded-xl object-cover ring-1 ring-gray-700" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white text-sm truncate">{channel.title}</h3>
            <FiExternalLink className="w-3 h-3 text-gray-500 flex-shrink-0 ml-2" />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <FiUsers className="w-3 h-3" />
              <span>{formatNumber(channel.subscriberCount)}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <FiVideo className="w-3 h-3" />
              <span>{formatNumber(channel.videoCount)}</span>
            </div>
            {channel.country && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <FiMapPin className="w-3 h-3" />
                <span>{channel.country}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Emails Preview */}
      {channel.emails && channel.emails.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 text-xs text-emerald-400 mb-1">
            <FiMail className="w-3 h-3" />
            <span>{channel.emails.length} email(s)</span>
          </div>
          <div className="text-xs text-blue-400 truncate">{channel.emails[0]}</div>
        </div>
      )}
      
      {/* Quality Badge */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getQualityBadge(channel.qualityScore)}`}>
          <FiStar className="w-3 h-3" />
          {channel.qualityScore || 0}
        </span>
        {channel.subscriberCount >= 100000 && (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            <FiAward className="w-3 h-3" />
            Top
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0f0f0f]/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
              >
                <FiArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  Creators
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {total.toLocaleString()} creators
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              {/* View Toggle */}
              <div className="flex bg-[#1a1a1a] border border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <FiList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 transition-colors ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <FiGrid className="w-4 h-4" />
                </button>
              </div>
              
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition-all text-emerald-400 text-sm"
              >
                <FiDownload className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-gray-300 text-sm"
              >
                <FiSliders className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {Object.values(filters).some(v => v && v !== '' && v !== false && v !== 'all') && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Quick Presets - Scrollable on mobile */}
        <div className="mb-4 overflow-x-auto pb-2 -mx-4 px-4">
          <div className="flex gap-2 min-w-max">
            <button
              onClick={() => applyPreset('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activePreset === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => applyPreset('recent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activePreset === 'recent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiClock className="inline w-3 h-3 mr-1" />
              Recent
            </button>
            <button
              onClick={() => applyPreset('top')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activePreset === 'top'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiTrendingUp className="inline w-3 h-3 mr-1" />
              Top
            </button>
            <button
              onClick={() => applyPreset('highQuality')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activePreset === 'highQuality'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiAward className="inline w-3 h-3 mr-1" />
              High Quality
            </button>
            <button
              onClick={() => applyPreset('withEmails')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activePreset === 'withEmails'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiMail className="inline w-3 h-3 mr-1" />
              Most Emails
            </button>
          </div>
        </div>

        {/* Search Bar - Always visible */}
        <div className="mb-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search by channel name or email..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
            />
          </div>
        </div>

        {/* Filters Panel - Collapsible */}
        {showFilters && (
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl mb-4">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FiFilter className="text-blue-400 text-sm" />
                  <h3 className="text-white font-medium text-sm">Filters</h3>
                </div>
                <button
                  onClick={resetFilters}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Reset
                </button>
              </div>
              
              <div className="space-y-3">
                {/* Date Range - Mobile optimized */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date Added</label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                  >
                    {dateRangeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {filters.dateRange === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={filters.customStartDate}
                      onChange={(e) => setFilters({ ...filters, customStartDate: e.target.value })}
                      className="px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                      placeholder="From"
                    />
                    <input
                      type="date"
                      value={filters.customEndDate}
                      onChange={(e) => setFilters({ ...filters, customEndDate: e.target.value })}
                      className="px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                      placeholder="To"
                    />
                  </div>
                )}

                {/* Subscriber Range */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Subscribers</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={filters.minSubscribers}
                      onChange={(e) => setFilters({ ...filters, minSubscribers: e.target.value })}
                      placeholder="Min"
                      className="w-1/2 px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                    />
                    <input
                      type="number"
                      value={filters.maxSubscribers}
                      onChange={(e) => setFilters({ ...filters, maxSubscribers: e.target.value })}
                      placeholder="Max"
                      className="w-1/2 px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                {/* Quality Range */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Quality Score</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={filters.minQuality}
                      onChange={(e) => setFilters({ ...filters, minQuality: e.target.value })}
                      placeholder="Min"
                      className="w-1/2 px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                    />
                    <input
                      type="number"
                      value={filters.maxQuality}
                      onChange={(e) => setFilters({ ...filters, maxQuality: e.target.value })}
                      placeholder="Max"
                      className="w-1/2 px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                </div>

                {/* Country */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Country</label>
                  <select
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">All Countries</option>
                    {countries.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Checkboxes */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={filters.hasWebsite}
                      onChange={(e) => setFilters({ ...filters, hasWebsite: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Has Website
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={filters.hasSocial}
                      onChange={(e) => setFilters({ ...filters, hasSocial: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Has Social Links
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={filters.hasPhone}
                      onChange={(e) => setFilters({ ...filters, hasPhone: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    Has Phone
                  </label>
                </div>

                {/* Sort */}
                <div className="flex gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                    className="flex-1 px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-white"
                  >
                    <option value="qualityScore">Quality</option>
                    <option value="subscriberCount">Subscribers</option>
                    <option value="emails">Emails</option>
                    <option value="scrapedAt">Date Added</option>
                  </select>
                  <button
                    onClick={() => setFilters({ ...filters, sortOrder: filters.sortOrder === 'desc' ? 'asc' : 'desc' })}
                    className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-300"
                  >
                    {filters.sortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="mb-3 text-xs text-gray-500">
          Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} of {total.toLocaleString()} creators
        </div>

        {/* Content - Table or Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex p-4 bg-gray-800/30 rounded-full mb-4">
              <FiUsers className="text-4xl text-gray-600" />
            </div>
            <p className="text-gray-500">No creators found</p>
            <button onClick={resetFilters} className="mt-2 text-sm text-blue-400 hover:underline">
              Reset filters
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          // Card View - Mobile Friendly
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {channels.map(channel => (
              <CreatorCard key={channel.channelId} channel={channel} />
            ))}
          </div>
        ) : (
          // Table View - Responsive with horizontal scroll on mobile
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-[#1a1a1a] border-b border-gray-800">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">Creator</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">Stats</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Email</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 hidden md:table-cell">Contact</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {channels.map((channel) => (
                    <tr 
                      key={channel.channelId} 
                      className="hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                      onClick={() => openChannelDetails(channel)}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {channel.thumbnailUrl && (
                            <img src={channel.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-gray-700" />
                          )}
                          <div>
                            <div className="font-medium text-white text-sm truncate max-w-[150px] sm:max-w-none">
                              {channel.title}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              <FiUsers className="w-3 h-3" />
                              <span>{formatNumber(channel.subscriberCount)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-1 text-gray-400">
                            <FiVideo className="w-3 h-3" />
                            <span>{formatNumber(channel.videoCount)} videos</span>
                          </div>
                          {channel.country && (
                            <div className="flex items-center gap-1 text-gray-500">
                              <FiMapPin className="w-3 h-3" />
                              <span>{channel.country}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        {channel.emails && channel.emails.length > 0 ? (
                          <div className="text-xs text-blue-400 truncate max-w-[150px]">
                            {channel.emails[0]}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">No email</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {channel.websiteUrl && (
                          <div className="text-xs text-gray-400 truncate max-w-[120px]">
                            {new URL(channel.websiteUrl).hostname}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getQualityBadge(channel.qualityScore)}`}>
                          <FiStar className="w-3 h-3" />
                          {channel.qualityScore || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination - Mobile Friendly */}
        {totalPages > 1 && (
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-xs text-gray-500 order-2 sm:order-1">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2 order-1 sm:order-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-800 transition-all text-gray-300"
              >
                Previous
              </button>
              <div className="flex gap-1">
                {[...Array(Math.min(3, totalPages))].map((_, i) => {
                  let pageNum;
                  if (totalPages <= 3) {
                    pageNum = i + 1;
                  } else if (page === 1) {
                    pageNum = i + 1;
                  } else if (page === totalPages) {
                    pageNum = totalPages - 2 + i;
                  } else {
                    pageNum = page - 1 + i;
                  }
                  
                  if (pageNum > 0 && pageNum <= totalPages) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                          page === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  return null;
                })}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-800 transition-all text-gray-300"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notion-style Drawer - Responsive */}
      {isDrawerOpen && selectedChannel && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={closeDrawer}
          />
          <div className={`fixed right-0 top-0 h-full w-full max-w-md sm:max-w-lg md:max-w-2xl bg-[#0f0f0f] shadow-2xl z-50 transform transition-transform duration-300 ease-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'} overflow-y-auto`}>
            {/* Drawer Header */}
            <div className="sticky top-0 bg-[#0f0f0f] border-b border-gray-800 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/10 rounded-lg">
                  <FiInfo className="text-blue-400 text-lg sm:text-xl" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-semibold text-white">Channel Details</h2>
                  <p className="text-xs text-gray-500">Complete creator information</p>
                </div>
              </div>
              <button onClick={closeDrawer} className="p-1.5 hover:bg-gray-800 rounded-lg">
                <FiX className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              </button>
            </div>

            {/* Drawer Content - Mobile Optimized */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Hero Section */}
              <div className="flex gap-3 sm:gap-4">
                {selectedChannel.thumbnailUrl && (
                  <img src={selectedChannel.thumbnailUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover ring-1 ring-gray-700" />
                )}
                <div className="flex-1">
                  <h3 className="text-base sm:text-xl font-bold text-white mb-1">{selectedChannel.title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <FiUsers className="w-3 h-3" />
                      {formatNumber(selectedChannel.subscriberCount)} subs
                    </span>
                    <span className="flex items-center gap-1">
                      <FiVideo className="w-3 h-3" />
                      {formatNumber(selectedChannel.videoCount)} videos
                    </span>
                    {selectedChannel.country && (
                      <span className="flex items-center gap-1">
                        <FiMapPin className="w-3 h-3" />
                        {selectedChannel.country}
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://youtube.com/channel/${selectedChannel.channelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:underline"
                  >
                    <FiYoutube className="w-3 h-3" />
                    Visit Channel
                    <FiExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Description */}
              {selectedChannel.description && (
                <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                  {selectedChannel.description}
                </p>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-[#1a1a1a] rounded-lg sm:rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FiEye className="text-blue-400 text-xs sm:text-sm" />
                    <span className="text-xs text-gray-500">Engagement</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-white">
                    {selectedChannel.engagement?.engagementRate 
                      ? `${Math.round(selectedChannel.engagement.engagementRate * 100)}%`
                      : 'N/A'}
                  </p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg sm:rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <FiStar className="text-yellow-400 text-xs sm:text-sm" />
                    <span className="text-xs text-gray-500">Quality</span>
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-white">{selectedChannel.qualityScore || 0}</p>
                </div>
              </div>

              {/* Emails */}
              {selectedChannel.emails && selectedChannel.emails.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                    <FiMail className="text-emerald-400" />
                    Email Contacts ({selectedChannel.emails.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedChannel.emails.map((email, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg">
                        <span className="text-xs sm:text-sm text-blue-400 break-all flex-1">{email}</span>
                        <button
                          onClick={() => copyToClipboard(email, 'Email')}
                          className="p-1 ml-2 hover:bg-gray-700 rounded-lg flex-shrink-0"
                        >
                          {copiedEmail === email ? (
                            <FiCheck className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
                          ) : (
                            <FiCopy className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Info */}
              {(selectedChannel.websiteUrl || (selectedChannel.phoneNumbers && selectedChannel.phoneNumbers.length > 0)) && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">Contact Info</h4>
                  <div className="space-y-2">
                    {selectedChannel.websiteUrl && (
                      <a href={selectedChannel.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg text-sm text-blue-400 break-all">
                        <FiGlobe className="flex-shrink-0" />
                        <span className="truncate">{selectedChannel.websiteUrl}</span>
                      </a>
                    )}
                    {selectedChannel.phoneNumbers?.map((phone, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg text-sm text-gray-300">
                        <FiPhone className="flex-shrink-0" />
                        <span>{phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Links */}
              {selectedChannel.socialLinks && selectedChannel.socialLinks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2">Social Media</h4>
                  <div className="space-y-2">
                    {selectedChannel.socialLinks.map((social, idx) => (
                      <a key={idx} href={social.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg text-sm text-blue-400">
                        {getPlatformIcon(social.platform)}
                        <span className="capitalize">{social.platform}</span>
                        <FiExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}