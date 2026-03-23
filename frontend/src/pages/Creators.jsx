import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FiMail, FiGlobe, FiDownload, FiSearch, FiFilter, FiExternalLink, 
  FiUsers, FiVideo, FiStar, FiArrowLeft, FiCopy, FiCheck, FiEye, 
  FiCalendar, FiMapPin, FiLink, FiX, FiSliders, FiTrendingUp, 
  FiClock, FiAward, FiZap, FiBarChart2, FiRefreshCw, FiInfo,
  FiTwitter, FiInstagram, FiFacebook, FiLinkedin, FiYoutube,
  FiPhone, FiMessageSquare, FiShare2, FiHeart, FiThumbsUp
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const API_BASE_URL = 'https://api.heekentertainment.com/api';

export default function Creators() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
  const [showFilters, setShowFilters] = useState(true);
  const [activePreset, setActivePreset] = useState('all');

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

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0f0f0f]/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <FiArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back to Dashboard</span>
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  Creators Database
                </h1>
                <p className="text-gray-500 text-sm mt-1">
                  {total.toLocaleString()} creators with verified email contacts
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition-all text-emerald-400 text-sm"
              >
                <FiDownload className="w-4 h-4" />
                Export CSV
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-gray-300 text-sm"
              >
                <FiSliders className="w-4 h-4" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Quick Presets */}
        <div className="mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => applyPreset('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activePreset === 'all'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiRefreshCw className="inline w-4 h-4 mr-2" />
              All Creators
            </button>
            <button
              onClick={() => applyPreset('recent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activePreset === 'recent'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiClock className="inline w-4 h-4 mr-2" />
              Recently Added
            </button>
            <button
              onClick={() => applyPreset('top')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activePreset === 'top'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiTrendingUp className="inline w-4 h-4 mr-2" />
              Top Creators
            </button>
            <button
              onClick={() => applyPreset('highQuality')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activePreset === 'highQuality'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiAward className="inline w-4 h-4 mr-2" />
              High Quality
            </button>
            <button
              onClick={() => applyPreset('withEmails')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activePreset === 'withEmails'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'bg-[#1a1a1a] border border-gray-700 text-gray-300 hover:bg-gray-800'
              }`}
            >
              <FiMail className="inline w-4 h-4 mr-2" />
              Most Emails
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl mb-6">
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FiFilter className="text-blue-400" />
                  <h3 className="text-white font-medium">Advanced Filters</h3>
                </div>
                <button
                  onClick={resetFilters}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Reset All
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* Search */}
                <div className="lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Search Channels
                  </label>
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                    <input
                      type="text"
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      placeholder="Search by channel name, email, or description..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                    />
                  </div>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Date Added
                  </label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                  >
                    {dateRangeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Date Range */}
                {filters.dateRange === 'custom' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={filters.customStartDate}
                        onChange={(e) => setFilters({ ...filters, customStartDate: e.target.value })}
                        className="w-full px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={filters.customEndDate}
                        onChange={(e) => setFilters({ ...filters, customEndDate: e.target.value })}
                        className="w-full px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                      />
                    </div>
                  </>
                )}

                {/* Subscriber Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Subscriber Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={filters.minSubscribers}
                      onChange={(e) => setFilters({ ...filters, minSubscribers: e.target.value })}
                      placeholder="Min"
                      className="w-1/2 px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                    />
                    <input
                      type="number"
                      value={filters.maxSubscribers}
                      onChange={(e) => setFilters({ ...filters, maxSubscribers: e.target.value })}
                      placeholder="Max"
                      className="w-1/2 px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                    />
                  </div>
                </div>

                {/* Quality Score Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Quality Score
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={filters.minQuality}
                      onChange={(e) => setFilters({ ...filters, minQuality: e.target.value })}
                      placeholder="Min"
                      className="w-1/2 px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                    />
                    <input
                      type="number"
                      value={filters.maxQuality}
                      onChange={(e) => setFilters({ ...filters, maxQuality: e.target.value })}
                      placeholder="Max"
                      className="w-1/2 px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                    />
                  </div>
                </div>

                {/* Country */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Country
                  </label>
                  <select
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                  >
                    <option value="">All Countries</option>
                    {countries.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Contact Info Filters */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Contact Information
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.hasWebsite}
                        onChange={(e) => setFilters({ ...filters, hasWebsite: e.target.checked })}
                        className="w-4 h-4 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Has Website</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.hasSocial}
                        onChange={(e) => setFilters({ ...filters, hasSocial: e.target.checked })}
                        className="w-4 h-4 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Has Social Links</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.hasPhone}
                        onChange={(e) => setFilters({ ...filters, hasPhone: e.target.checked })}
                        className="w-4 h-4 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Has Phone Number</span>
                    </label>
                  </div>
                </div>

                {/* Sort Options */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Sort By
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={filters.sortBy}
                      onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                      className="flex-1 px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white text-sm"
                    >
                      <option value="qualityScore">Quality Score</option>
                      <option value="subscriberCount">Subscribers</option>
                      <option value="emails">Email Count</option>
                      <option value="scrapedAt">Date Added</option>
                      <option value="title">Channel Name</option>
                    </select>
                    <button
                      onClick={() => setFilters({ ...filters, sortOrder: filters.sortOrder === 'desc' ? 'asc' : 'desc' })}
                      className="px-3 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-gray-300 text-sm"
                    >
                      {filters.sortOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Filters Display */}
              {(filters.search || filters.minSubscribers || filters.maxSubscribers || 
                filters.minQuality || filters.maxQuality || filters.country || 
                filters.hasWebsite || filters.hasSocial || filters.hasPhone || 
                filters.dateRange !== 'all') && (
                <div className="mt-5 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-400 mb-2">Active Filters:</p>
                  <div className="flex flex-wrap gap-2">
                    {filters.search && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-xs">
                        Search: {filters.search}
                        <FiX className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, search: '' })} />
                      </span>
                    )}
                    {(filters.minSubscribers || filters.maxSubscribers) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded-lg text-xs">
                        Subs: {filters.minSubscribers || '0'} - {filters.maxSubscribers || '∞'}
                        <FiX className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, minSubscribers: '', maxSubscribers: '' })} />
                      </span>
                    )}
                    {(filters.minQuality || filters.maxQuality) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-xs">
                        Quality: {filters.minQuality || '0'} - {filters.maxQuality || '100'}
                        <FiX className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, minQuality: '', maxQuality: '' })} />
                      </span>
                    )}
                    {filters.country && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-400 rounded-lg text-xs">
                        Country: {countries.find(c => c.code === filters.country)?.name}
                        <FiX className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, country: '' })} />
                      </span>
                    )}
                    {filters.dateRange !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg text-xs">
                        Date: {dateRangeOptions.find(o => o.value === filters.dateRange)?.label}
                        <FiX className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, dateRange: 'all' })} />
                      </span>
                    )}
                    {(filters.hasWebsite || filters.hasSocial || filters.hasPhone) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs">
                        Contact Info
                        <FiX className="w-3 h-3 cursor-pointer" onClick={() => setFilters({ ...filters, hasWebsite: false, hasSocial: false, hasPhone: false })} />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1a1a1a] border-b border-gray-800">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Creator</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Stats</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email Contacts</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Contact Info</th>
                  <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-12 text-center">
                      <div className="flex justify-center">
                        <div className="relative">
                          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
                        </div>
                      </div>
                      <p className="text-gray-500 mt-3 text-sm">Loading creators...</p>
                    </td>
                  </tr>
                ) : channels.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-12 text-center">
                      <div className="inline-flex p-4 bg-gray-800/30 rounded-full mb-4">
                        <FiUsers className="text-4xl text-gray-600" />
                      </div>
                      <p className="text-gray-500">No creators found</p>
                      <p className="text-xs text-gray-600 mt-1">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  channels.map((channel) => (
                    <tr 
                      key={channel.channelId} 
                      className="hover:bg-[#1a1a1a] transition-colors group cursor-pointer"
                      onClick={() => openChannelDetails(channel)}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {channel.thumbnailUrl && (
                            <img src={channel.thumbnailUrl} alt="" className="w-12 h-12 rounded-xl object-cover ring-1 ring-gray-700" />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-white text-sm">
                                {channel.title}
                              </span>
                              <FiExternalLink className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500 font-mono">
                                {channel.channelId?.slice(0, 12)}...
                              </span>
                              {channel.country && (
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <FiMapPin className="w-3 h-3" />
                                  {channel.country}
                                </span>
                              )}
                            </div>
                            {filters.sortBy === 'scrapedAt' && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-blue-400">
                                <FiClock className="w-3 h-3" />
                                Added: {new Date(channel.scrapedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-sm">
                            <FiUsers className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-white font-medium">{formatNumber(channel.subscriberCount)}</span>
                            <span className="text-gray-500 text-xs">subs</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm">
                            <FiVideo className="w-3.5 h-3.5 text-purple-400" />
                            <span className="text-white">{formatNumber(channel.videoCount)}</span>
                            <span className="text-gray-500 text-xs">videos</span>
                          </div>
                          {channel.engagement?.engagementRate > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <FiEye className="w-3 h-3" />
                              <span>{Math.round(channel.engagement.engagementRate * 100)}% engagement</span>
                            </div>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          {channel.emails?.slice(0, 2).map((email, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 group/email">
                              <FiMail className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                              <span className="text-blue-400 text-xs truncate max-w-[180px]">
                                {email}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(email, 'Email');
                                }}
                                className="opacity-0 group-hover/email:opacity-100 transition-opacity"
                              >
                                {copiedEmail === email ? (
                                  <FiCheck className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <FiCopy className="w-3 h-3 text-gray-500 hover:text-gray-300" />
                                )}
                              </button>
                            </div>
                          ))}
                          {channel.emails?.length > 2 && (
                            <div className="text-xs text-gray-500 pl-5">
                              +{channel.emails.length - 2} more emails
                            </div>
                          )}
                          {(!channel.emails || channel.emails.length === 0) && (
                            <span className="text-xs text-gray-500">No emails</span>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="space-y-1.5">
                          {channel.websiteUrl && (
                            <div className="flex items-center gap-1.5">
                              <FiGlobe className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-blue-400 text-xs truncate max-w-[150px]">
                                {new URL(channel.websiteUrl).hostname}
                              </span>
                            </div>
                          )}
                          {channel.socialLinks?.slice(0, 2).map((social, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              {getPlatformIcon(social.platform)}
                              <span className="text-blue-400 text-xs truncate max-w-[150px]">
                                {social.platform}
                              </span>
                            </div>
                          ))}
                          {channel.phoneNumbers?.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                              <FiPhone className="w-3.5 h-3.5" />
                              <span className="truncate">{channel.phoneNumbers[0]}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getQualityBadge(channel.qualityScore)}`}>
                            <FiStar className="w-3 h-3" />
                            {channel.qualityScore || 0}
                          </span>
                          {channel.subscriberCount >= 100000 && (
                            <div className="text-xs text-amber-400 flex items-center gap-1">
                              <FiAward className="w-3 h-3" />
                              Top Creator
                            </div>
                          )}
                          {channel.emails?.length >= 3 && (
                            <div className="text-xs text-emerald-400 flex items-center gap-1">
                              <FiMail className="w-3 h-3" />
                              {channel.emails.length} emails
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-4 border-t border-gray-800 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total.toLocaleString()} creators
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-all text-gray-300"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
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
                  className="px-3 py-1.5 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-all text-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notion-style Drawer */}
      {isDrawerOpen && selectedChannel && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
            onClick={closeDrawer}
          />
          
          {/* Drawer */}
          <div className={`fixed right-0 top-0 h-full w-full max-w-2xl bg-[#0f0f0f] shadow-2xl z-50 transform transition-transform duration-300 ease-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="sticky top-0 bg-[#0f0f0f] border-b border-gray-800 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <FiInfo className="text-blue-400 text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Channel Details</h2>
                  <p className="text-sm text-gray-500">Complete creator information</p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <FiX className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto h-[calc(100%-73px)] custom-scrollbar">
              {/* Hero Section */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent h-32" />
                <div className="px-6 pt-8 pb-6">
                  <div className="flex items-start gap-6">
                    {selectedChannel.thumbnailUrl && (
                      <img 
                        src={selectedChannel.thumbnailUrl} 
                        alt={selectedChannel.title}
                        className="w-24 h-24 rounded-2xl object-cover ring-2 ring-gray-700"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-2xl font-bold text-white mb-2">
                            {selectedChannel.title}
                          </h3>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <FiUsers className="w-4 h-4 text-blue-400" />
                              <span className="text-gray-300">{formatNumber(selectedChannel.subscriberCount)} subscribers</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FiVideo className="w-4 h-4 text-purple-400" />
                              <span className="text-gray-300">{formatNumber(selectedChannel.videoCount)} videos</span>
                            </div>
                            {selectedChannel.country && (
                              <div className="flex items-center gap-1.5">
                                <FiMapPin className="w-4 h-4 text-orange-400" />
                                <span className="text-gray-300">{selectedChannel.country}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <a
                          href={`https://youtube.com/channel/${selectedChannel.channelId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-sm text-gray-300"
                        >
                          <FiYoutube className="text-red-400" />
                          Visit Channel
                          <FiExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      
                      {selectedChannel.description && (
                        <p className="mt-4 text-gray-400 text-sm leading-relaxed line-clamp-3">
                          {selectedChannel.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 px-6 mb-6">
                <div className="bg-[#1a1a1a] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiEye className="text-blue-400" />
                    <span className="text-xs text-gray-500">Engagement</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {selectedChannel.engagement?.engagementRate 
                      ? `${Math.round(selectedChannel.engagement.engagementRate * 100)}%`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Engagement Rate</p>
                </div>
                
                <div className="bg-[#1a1a1a] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FiStar className="text-yellow-400" />
                    <span className="text-xs text-gray-500">Quality</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{selectedChannel.qualityScore || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Quality Score</p>
                </div>
              </div>

              {/* Emails Section */}
              {selectedChannel.emails && selectedChannel.emails.length > 0 && (
                <div className="px-6 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FiMail className="text-emerald-400" />
                    <h4 className="text-white font-semibold">Email Contacts</h4>
                    <span className="text-xs text-gray-500">{selectedChannel.emails.length} found</span>
                  </div>
                  <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-2">
                    {selectedChannel.emails.map((email, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-800 rounded-lg transition-colors group">
                        <span className="text-blue-400 text-sm font-mono">{email}</span>
                        <button
                          onClick={() => copyToClipboard(email, 'Email')}
                          className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          {copiedEmail === email ? (
                            <FiCheck className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <FiCopy className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Information */}
              <div className="px-6 mb-6">
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <FiGlobe className="text-purple-400" />
                  Contact Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedChannel.websiteUrl && (
                    <div className="bg-[#1a1a1a] rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FiGlobe className="text-blue-400" />
                        <span className="text-xs text-gray-500">Website</span>
                      </div>
                      <a
                        href={selectedChannel.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-sm hover:underline break-all"
                      >
                        {selectedChannel.websiteUrl}
                      </a>
                    </div>
                  )}
                  
                  {selectedChannel.phoneNumbers && selectedChannel.phoneNumbers.length > 0 && (
                    <div className="bg-[#1a1a1a] rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FiPhone className="text-green-400" />
                        <span className="text-xs text-gray-500">Phone Numbers</span>
                      </div>
                      {selectedChannel.phoneNumbers.map((phone, idx) => (
                        <p key={idx} className="text-gray-300 text-sm">{phone}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Social Links */}
              {selectedChannel.socialLinks && selectedChannel.socialLinks.length > 0 && (
                <div className="px-6 mb-6">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <FiLink className="text-cyan-400" />
                    Social Media
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedChannel.socialLinks.map((social, idx) => (
                      <a
                        key={idx}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-[#1a1a1a] rounded-xl p-4 hover:bg-gray-800 transition-colors flex items-center gap-3"
                      >
                        {getPlatformIcon(social.platform)}
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium capitalize">{social.platform}</p>
                          <p className="text-gray-500 text-xs truncate">{social.url}</p>
                        </div>
                        <FiExternalLink className="text-gray-500 w-4 h-4" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="px-6 pb-6">
                <h4 className="text-white font-semibold mb-3">Additional Information</h4>
                <div className="bg-[#1a1a1a] rounded-xl p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Channel ID</span>
                    <span className="text-gray-300 text-sm font-mono">{selectedChannel.channelId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Scraped Date</span>
                    <span className="text-gray-300 text-sm">{new Date(selectedChannel.scrapedAt).toLocaleString()}</span>
                  </div>
                  {selectedChannel.keywords && selectedChannel.keywords.length > 0 && (
                    <div>
                      <span className="text-gray-500 text-sm">Keywords</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedChannel.keywords.slice(0, 10).map((keyword, idx) => (
                          <span key={idx} className="px-2 py-1 bg-gray-800 rounded-lg text-xs text-gray-400">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a1a1a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}</style>
    </div>
  );
}