import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import {
  PlayIcon,
  DocumentTextIcon,
  UserGroupIcon,
  EnvelopeIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { Toaster, toast } from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

// Fix: Use correct port 5001 (matching your server)
const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [channels, setChannels] = useState([]);
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    hasEmails: '',
    hasHighSubscribers: '',
    minSubscribers: '',
    keyword: '',
    sortBy: 'scrapedAt',
    sortOrder: 'desc'
  });
  const [logFilters, setLogFilters] = useState({
    page: 1,
    limit: 50,
    level: '',
    source: '',
    startDate: null,
    endDate: null
  });
  const [scrapeForm, setScrapeForm] = useState({
    keywords: '',
    count: 1000
  });
  const [totalPages, setTotalPages] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logStats, setLogStats] = useState({ info: 0, success: 0, warning: 0, error: 0, debug: 0 });
  const logsEndRef = useRef(null);

  // Socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      setSocketConnected(true);
      toast.success('Connected to real-time logs');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setSocketConnected(false);
      toast.error('Disconnected from real-time logs');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setSocketConnected(false);
    });

    socket.on('initial_logs', (initialLogs) => {
      setLogs(initialLogs || []);
    });

    socket.on('log', (log) => {
      setLogs(prev => {
        const newLogs = [...prev, log];
        // Keep only last 200 logs
        return newLogs.slice(-200);
      });
      
      // Show toast for errors
      if (log.level === 'error') {
        toast.error(log.message);
      } else if (log.level === 'success') {
        toast.success(log.message);
      } else if (log.level === 'warning') {
        toast.warning(log.message);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Load initial data
  useEffect(() => {
    fetchStats();
    fetchChannels();
    fetchQueue();
    fetchLogs();
    
    // Refresh data every 10 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchQueue();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Fetch channels with filters
  const fetchChannels = async () => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params.append(key, filters[key]);
        }
      });
      
      const response = await fetch(`${API_URL}/channels?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch channels');
      }
      const data = await response.json();
      setChannels(data.channels || []);
      setTotalPages(data.pages || 1);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      toast.error('Failed to fetch channels');
    }
  };

  // Fetch queue
  const fetchQueue = async () => {
    try {
      const response = await fetch(`${API_URL}/queue`);
      if (!response.ok) {
        throw new Error('Failed to fetch queue');
      }
      const data = await response.json();
      setQueue(data.queue || []);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      const data = await response.json();
      setStats(data || {});
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      // Fix: Remove null values and convert dates properly
      const params = new URLSearchParams();
      params.append('page', logFilters.page);
      params.append('limit', logFilters.limit);
      
      if (logFilters.level) params.append('level', logFilters.level);
      if (logFilters.source) params.append('source', logFilters.source);
      if (logFilters.startDate) params.append('startDate', logFilters.startDate.toISOString());
      if (logFilters.endDate) params.append('endDate', logFilters.endDate.toISOString());
      
      const response = await fetch(`${API_URL}/logs?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = await response.json();
      setLogs(data.logs || []);
      setLogTotalPages(data.pages || 1);
      setLogStats(data.stats || { info: 0, success: 0, warning: 0, error: 0, debug: 0 });
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      toast.error('Failed to fetch logs');
    }
  };

  // Start scrape
  const startScrape = async () => {
    if (!scrapeForm.keywords.trim()) {
      toast.error('Please enter keywords');
      return;
    }

    setLoading(true);
    try {
      const keywords = scrapeForm.keywords.split(',').map(k => k.trim()).filter(k => k);
      const response = await fetch(`${API_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords, count: parseInt(scrapeForm.count) || 1000 })
      });
      
      if (response.ok) {
        toast.success('Scrape task queued successfully');
        setScrapeForm({ keywords: '', count: 1000 });
        fetchQueue();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to start scrape');
      }
    } catch (error) {
      console.error('Scrape error:', error);
      toast.error('Failed to start scrape');
    } finally {
      setLoading(false);
    }
  };

  // Cancel task
  const cancelTask = async (taskId) => {
    try {
      const response = await fetch(`${API_URL}/task/${taskId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        toast.success('Task cancelled');
        fetchQueue();
      } else {
        toast.error('Failed to cancel task');
      }
    } catch (error) {
      console.error('Cancel task error:', error);
      toast.error('Failed to cancel task');
    }
  };

  // Export channels
  const exportChannels = () => {
    if (!channels || channels.length === 0) {
      toast.error('No channels to export');
      return;
    }

    const csv = [
      ['Title', 'Channel ID', 'Subscribers', 'Videos', 'Views', 'Emails', 'Has Emails', 'Has 50k+ Subs', 'Saved Reason', 'Keywords', 'Country', 'Published At', 'Scraped At'].join(','),
      ...channels.map(c => [
        `"${(c.title || '').replace(/"/g, '""')}"`,
        c.channelId || '',
        c.subscriberCount || 0,
        c.videoCount || 0,
        c.viewCount || 0,
        `"${(c.emails || []).join('; ')}"`,
        c.hasEmails || false,
        c.hasHighSubscribers || false,
        c.savedReason || 'emails',
        `"${(c.keywords || []).join('; ')}"`,
        c.country || 'N/A',
        c.publishedAt ? new Date(c.publishedAt).toLocaleDateString() : 'N/A',
        c.scrapedAt ? new Date(c.scrapedAt).toLocaleString() : 'N/A'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `channels-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Clear logs
  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs?')) return;
    
    try {
      const response = await fetch(`${API_URL}/logs`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Logs cleared');
        setLogs([]);
        setLogStats({ info: 0, success: 0, warning: 0, error: 0, debug: 0 });
      }
    } catch (error) {
      console.error('Clear logs error:', error);
      toast.error('Failed to clear logs');
    }
  };

  // View channel details
  const viewChannelDetails = (channel) => {
    setSelectedChannel(channel);
    setShowChannelModal(true);
  };

  // Apply filters
  const applyFilters = () => {
    setFilters({ ...filters, page: 1 });
    setTimeout(fetchChannels, 100);
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      page: 1,
      limit: 10,
      hasEmails: '',
      hasHighSubscribers: '',
      minSubscribers: '',
      keyword: '',
      sortBy: 'scrapedAt',
      sortOrder: 'desc'
    });
    setTimeout(fetchChannels, 100);
  };

  // Apply log filters
  const applyLogFilters = () => {
    setLogFilters({ ...logFilters, page: 1 });
    setTimeout(fetchLogs, 100);
  };

  // Safe access to stats with default values
  const safeStats = {
    totalChannels: stats.totalChannels || 0,
    todayChannels: stats.todayChannels || 0,
    channelsWithEmails: stats.channelsWithEmails || 0,
    channelsWithHighSubs: stats.channelsWithHighSubs || 0,
    channelsWithBoth: stats.channelsWithBoth || 0,
    totalEmails: stats.totalEmails || 0,
    queueStats: stats.queueStats || { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 },
    saveRate: stats.saveRate || '0%'
  };

  // Chart data with safe values
  const channelChartData = {
    labels: ['With Emails', '50k+ Subs', 'Both'],
    datasets: [{
      label: 'Channels',
      data: [safeStats.channelsWithEmails, safeStats.channelsWithHighSubs, safeStats.channelsWithBoth],
      backgroundColor: ['#3B82F6', '#10B981', '#8B5CF6']
    }]
  };

  const queueChartData = {
    labels: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
    datasets: [{
      data: [
        safeStats.queueStats.pending,
        safeStats.queueStats.processing,
        safeStats.queueStats.completed,
        safeStats.queueStats.failed,
        safeStats.queueStats.cancelled
      ],
      backgroundColor: ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#6B7280']
    }]
  };

  const logChartData = {
    labels: ['Info', 'Success', 'Warning', 'Error', 'Debug'],
    datasets: [{
      data: [
        logStats.info || 0,
        logStats.success || 0,
        logStats.warning || 0,
        logStats.error || 0,
        logStats.debug || 0
      ],
      backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
    }]
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <PlayIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">YouTube Scraper Dashboard</h1>
                <p className="text-sm text-gray-500">Monitor and manage your YouTube channel scraping</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                socketConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span>{socketConnected ? 'Live' : 'Offline'}</span>
              </span>
              <button
                onClick={() => window.location.reload()}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                title="Refresh"
              >
                <ArrowPathIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: ChartBarIcon },
              { id: 'channels', label: 'Channels', icon: UserGroupIcon },
              { id: 'queue', label: 'Queue', icon: ClockIcon },
              { id: 'logs', label: 'Logs', icon: DocumentTextIcon }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Channels</p>
                    <p className="text-3xl font-bold text-gray-900">{safeStats.totalChannels.toLocaleString()}</p>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <UserGroupIcon className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <p className="text-sm text-green-600 mt-2 flex items-center">
                  <span className="font-medium">+{safeStats.todayChannels}</span>
                  <span className="text-gray-500 ml-1">today</span>
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">With Emails</p>
                    <p className="text-3xl font-bold text-gray-900">{safeStats.channelsWithEmails.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-lg">
                    <EnvelopeIcon className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">{safeStats.totalEmails.toLocaleString()}</span> total emails
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">50k+ Subscribers</p>
                    <p className="text-3xl font-bold text-gray-900">{safeStats.channelsWithHighSubs.toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-lg">
                    <ChartBarIcon className="h-8 w-8 text-purple-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Save rate: <span className="font-medium">{safeStats.saveRate}</span>
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Queue Status</p>
                    <p className="text-3xl font-bold text-gray-900">{safeStats.queueStats.pending}</p>
                  </div>
                  <div className="bg-orange-100 p-3 rounded-lg">
                    <ClockIcon className="h-8 w-8 text-orange-600" />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-medium">{safeStats.queueStats.processing}</span> processing
                </p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Channel Distribution</h3>
                <div className="h-80">
                  <Bar 
                    data={channelChartData}
                    options={{ 
                      maintainAspectRatio: false, 
                      responsive: true,
                      plugins: {
                        legend: {
                          display: false
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Queue Status</h3>
                <div className="h-80">
                  <Pie 
                    data={queueChartData}
                    options={{ 
                      maintainAspectRatio: false, 
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'bottom'
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Scrape Form */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Start New Scrape</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Keywords <span className="text-gray-400">(comma separated)</span>
                  </label>
                  <input
                    type="text"
                    value={scrapeForm.keywords}
                    onChange={(e) => setScrapeForm({ ...scrapeForm, keywords: e.target.value })}
                    placeholder="technology, business, gaming, education..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                  />
                  <p className="text-xs text-gray-500 mt-1">Enter keywords separated by commas</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Channels
                  </label>
                  <input
                    type="number"
                    value={scrapeForm.count}
                    onChange={(e) => setScrapeForm({ ...scrapeForm, count: e.target.value })}
                    min="100"
                    max="10000"
                    step="100"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max 10,000 channels</p>
                </div>
              </div>
              <button
                onClick={startScrape}
                disabled={loading}
                className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
              >
                {loading ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-5 w-5" />
                    <span>Start Scraping</span>
                  </>
                )}
              </button>
            </div>

            {/* Recent Logs Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
                <button
                  onClick={() => setActiveTab('logs')}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1"
                >
                  <span>View All</span>
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {logs && logs.slice(-20).map((log, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg text-sm ${
                      log?.level === 'error' ? 'bg-red-50 text-red-700 border-l-4 border-red-500' :
                      log?.level === 'success' ? 'bg-green-50 text-green-700 border-l-4 border-green-500' :
                      log?.level === 'warning' ? 'bg-yellow-50 text-yellow-700 border-l-4 border-yellow-500' :
                      log?.level === 'debug' ? 'bg-purple-50 text-purple-700 border-l-4 border-purple-500' :
                      'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start">
                      <span className="font-mono text-xs opacity-75 min-w-[70px]">
                        {log?.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '--:--:--'}
                      </span>
                      <span className="ml-2 font-medium">{log?.message || 'No message'}</span>
                    </div>
                  </div>
                ))}
                {(!logs || logs.length === 0) && (
                  <div className="text-center py-8 text-gray-500">
                    No logs available
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Channels Tab */}
        {activeTab === 'channels' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center space-x-4 mb-4">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <FunnelIcon className="h-5 w-5 text-gray-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email Status</label>
                  <select
                    value={filters.hasEmails}
                    onChange={(e) => setFilters({ ...filters, hasEmails: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Channels</option>
                    <option value="true">Has Emails</option>
                    <option value="false">No Emails</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Subscriber Status</label>
                  <select
                    value={filters.hasHighSubscribers}
                    onChange={(e) => setFilters({ ...filters, hasHighSubscribers: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Subscribers</option>
                    <option value="true">50k+ Subs</option>
                    <option value="false">Less than 50k</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Min Subscribers</label>
                  <input
                    type="number"
                    value={filters.minSubscribers}
                    onChange={(e) => setFilters({ ...filters, minSubscribers: e.target.value })}
                    placeholder="e.g., 10000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Keyword</label>
                  <input
                    type="text"
                    value={filters.keyword}
                    onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                    placeholder="Search by keyword"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="scrapedAt">Date Scraped</option>
                    <option value="subscriberCount">Subscribers</option>
                    <option value="title">Title</option>
                    <option value="videoCount">Videos</option>
                    <option value="viewCount">Views</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
                >
                  <XCircleIcon className="h-5 w-5" />
                  <span>Reset</span>
                </button>
                <button
                  onClick={applyFilters}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                  <span>Apply Filters</span>
                </button>
                <button
                  onClick={exportChannels}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Channels Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Channel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Subscribers
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Videos
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Emails
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Saved Reason
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Scraped At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {channels && channels.map(channel => (
                      <tr key={channel._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            {channel.thumbnailUrl ? (
                              <img
                                src={channel.thumbnailUrl}
                                alt={channel.title}
                                className="h-10 w-10 rounded-full mr-3 object-cover"
                                onError={(e) => e.target.style.display = 'none'}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200 mr-3 flex items-center justify-center">
                                <UserGroupIcon className="h-5 w-5 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                                {channel.title || 'Unknown'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {channel.customUrl || channel.channelId || 'N/A'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {channel.subscriberCount?.toLocaleString() || 0}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {channel.videoCount?.toLocaleString() || 0}
                        </td>
                        <td className="px-6 py-4">
                          {channel.emails && channel.emails.length > 0 ? (
                            <div className="space-y-1 max-w-xs">
                              {channel.emails.slice(0, 2).map((email, idx) => (
                                <div key={idx} className="text-sm text-blue-600 truncate">
                                  {email}
                                </div>
                              ))}
                              {channel.emails.length > 2 && (
                                <div className="text-xs text-gray-500">
                                  +{channel.emails.length - 2} more
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">No emails</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-x-1">
                            {channel.hasEmails && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Email
                              </span>
                            )}
                            {channel.hasHighSubscribers && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                50k+
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            channel.savedReason === 'both' ? 'bg-purple-100 text-purple-800' :
                            channel.savedReason === 'emails' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {channel.savedReason || 'emails'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {channel.scrapedAt ? format(new Date(channel.scrapedAt), 'MMM d, yyyy') : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => viewChannelDetails(channel)}
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!channels || channels.length === 0) && (
                      <tr>
                        <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                          No channels found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {channels && channels.length > 0 && (
                <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => {
                        setFilters({ ...filters, page: Math.max(1, filters.page - 1) });
                        setTimeout(fetchChannels, 100);
                      }}
                      disabled={filters.page === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        setFilters({ ...filters, page: Math.min(totalPages, filters.page + 1) });
                        setTimeout(fetchChannels, 100);
                      }}
                      disabled={filters.page === totalPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing page <span className="font-medium">{filters.page}</span> of{' '}
                        <span className="font-medium">{totalPages}</span>
                        {' '}· <span className="font-medium">{channels.length}</span> channels
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                        <button
                          onClick={() => {
                            setFilters({ ...filters, page: 1 });
                            setTimeout(fetchChannels, 100);
                          }}
                          disabled={filters.page === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">First</span>
                          <ChevronLeftIcon className="h-5 w-5" />
                          <ChevronLeftIcon className="h-5 w-5 -ml-3" />
                        </button>
                        <button
                          onClick={() => {
                            setFilters({ ...filters, page: Math.max(1, filters.page - 1) });
                            setTimeout(fetchChannels, 100);
                          }}
                          disabled={filters.page === 1}
                          className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Previous</span>
                          <ChevronLeftIcon className="h-5 w-5" />
                        </button>
                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                          Page {filters.page}
                        </span>
                        <button
                          onClick={() => {
                            setFilters({ ...filters, page: Math.min(totalPages, filters.page + 1) });
                            setTimeout(fetchChannels, 100);
                          }}
                          disabled={filters.page === totalPages}
                          className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Next</span>
                          <ChevronRightIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => {
                            setFilters({ ...filters, page: totalPages });
                            setTimeout(fetchChannels, 100);
                          }}
                          disabled={filters.page === totalPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="sr-only">Last</span>
                          <ChevronRightIcon className="h-5 w-5" />
                          <ChevronRightIcon className="h-5 w-5 -ml-3" />
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-medium text-gray-900">Task Queue</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Keywords
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {queue && queue.map(task => (
                      <tr key={task._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">
                          {task._id ? task._id.substring(0, 8) + '...' : 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {task.task || 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium ${
                            task.status === 'completed' ? 'bg-green-100 text-green-800' :
                            task.status === 'processing' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                            task.status === 'failed' ? 'bg-red-100 text-red-800' :
                            task.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {task.status === 'processing' && (
                              <ArrowPathIcon className="h-3 w-3 animate-spin mr-1" />
                            )}
                            {task.status || 'pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {task.stats ? (
                            <div className="text-sm">
                              <div className="text-gray-900 font-medium">
                                Saved: {task.stats.channelsSaved || 0}
                              </div>
                              <div className="text-gray-500 text-xs">
                                Scraped: {task.stats.channelsScraped || 0} | 
                                Skipped: {task.stats.channelsSkipped || 0}
                              </div>
                              {task.stats.emailsFound > 0 && (
                                <div className="text-xs text-green-600">
                                  Emails: {task.stats.emailsFound}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Not started</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                          {task.data?.keywords?.join(', ') || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {task.createdAt ? format(new Date(task.createdAt), 'MMM d, HH:mm') : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          {task.status === 'pending' && (
                            <button
                              onClick={() => cancelTask(task._id)}
                              className="text-red-600 hover:text-red-900 transition-colors"
                              title="Cancel Task"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!queue || queue.length === 0) && (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                          No tasks in queue
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="space-y-6">
            {/* Log Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <FunnelIcon className="h-5 w-5 text-gray-600" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Log Filters</h3>
                </div>
                <button
                  onClick={clearLogs}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                  <TrashIcon className="h-5 w-5" />
                  <span>Clear All Logs</span>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Log Level</label>
                  <select
                    value={logFilters.level}
                    onChange={(e) => setLogFilters({ ...logFilters, level: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Levels</option>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                    <option value="debug">Debug</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                  <select
                    value={logFilters.source}
                    onChange={(e) => setLogFilters({ ...logFilters, source: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Sources</option>
                    <option value="system">System</option>
                    <option value="api">API</option>
                    <option value="scraper">Scraper</option>
                    <option value="worker">Worker</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                  <DatePicker
                    selected={logFilters.startDate}
                    onChange={(date) => setLogFilters({ ...logFilters, startDate: date })}
                    placeholderText="Select start date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                  <DatePicker
                    selected={logFilters.endDate}
                    onChange={(date) => setLogFilters({ ...logFilters, endDate: date })}
                    placeholderText="Select end date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                    minDate={logFilters.startDate}
                  />
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={applyLogFilters}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                  <span>Apply Filters</span>
                </button>
              </div>
            </div>

            {/* Log Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {['info', 'success', 'warning', 'error', 'debug'].map(level => (
                <div key={level} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 capitalize">{level}</span>
                    <span className={`text-lg font-bold ${
                      level === 'error' ? 'text-red-600' :
                      level === 'success' ? 'text-green-600' :
                      level === 'warning' ? 'text-yellow-600' :
                      level === 'debug' ? 'text-purple-600' :
                      'text-blue-600'
                    }`}>
                      {logStats[level] || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Logs Display */}
            <div className="bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-800">
              <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-medium text-white flex items-center space-x-2">
                  <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                  <span>Live Logs</span>
                </h3>
                <span className="text-xs text-gray-500">
                  {logs ? logs.length : 0} logs • Auto-refresh
                </span>
              </div>
              <div className="p-4 h-[600px] overflow-y-auto font-mono text-sm">
                {logs && logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`mb-2 p-3 rounded ${
                      log?.level === 'error' ? 'bg-red-900/20 text-red-300 border-l-4 border-red-500' :
                      log?.level === 'success' ? 'bg-green-900/20 text-green-300 border-l-4 border-green-500' :
                      log?.level === 'warning' ? 'bg-yellow-900/20 text-yellow-300 border-l-4 border-yellow-500' :
                      log?.level === 'debug' ? 'bg-purple-900/20 text-purple-300 border-l-4 border-purple-500' :
                      'bg-blue-900/20 text-blue-300 border-l-4 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start">
                      <span className="text-gray-500 min-w-[180px]">
                        [{log?.timestamp ? format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss') : 'N/A'}]
                      </span>
                      <span className="ml-2 font-bold text-gray-400 min-w-[80px]">
                        [{log?.source || 'system'}]
                      </span>
                      <span className="ml-2 flex-1">{log?.message || 'No message'}</span>
                    </div>
                    {log?.details && Object.keys(log.details).length > 0 && (
                      <pre className="mt-2 ml-[270px] text-xs text-gray-500 bg-gray-800 p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                    {log?.taskId && (
                      <div className="mt-1 ml-[270px] text-xs text-gray-600">
                        Task: {log.taskId}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
                {(!logs || logs.length === 0) && (
                  <div className="text-center py-12 text-gray-500">
                    No logs available
                  </div>
                )}
              </div>
            </div>

            {/* Log Pagination */}
            {logs && logs.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => {
                      setLogFilters({ ...logFilters, page: Math.max(1, logFilters.page - 1) });
                      setTimeout(fetchLogs, 100);
                    }}
                    disabled={logFilters.page === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => {
                      setLogFilters({ ...logFilters, page: Math.min(logTotalPages, logFilters.page + 1) });
                      setTimeout(fetchLogs, 100);
                    }}
                    disabled={logFilters.page === logTotalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing page <span className="font-medium">{logFilters.page}</span> of{' '}
                      <span className="font-medium">{logTotalPages}</span>
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => {
                          setLogFilters({ ...logFilters, page: 1 });
                          setTimeout(fetchLogs, 100);
                        }}
                        disabled={logFilters.page === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">First</span>
                        <ChevronLeftIcon className="h-5 w-5" />
                        <ChevronLeftIcon className="h-5 w-5 -ml-3" />
                      </button>
                      <button
                        onClick={() => {
                          setLogFilters({ ...logFilters, page: Math.max(1, logFilters.page - 1) });
                          setTimeout(fetchLogs, 100);
                        }}
                        disabled={logFilters.page === 1}
                        className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Previous</span>
                        <ChevronLeftIcon className="h-5 w-5" />
                      </button>
                      <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                        Page {logFilters.page}
                      </span>
                      <button
                        onClick={() => {
                          setLogFilters({ ...logFilters, page: Math.min(logTotalPages, logFilters.page + 1) });
                          setTimeout(fetchLogs, 100);
                        }}
                        disabled={logFilters.page === logTotalPages}
                        className="relative inline-flex items-center px-2 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Next</span>
                        <ChevronRightIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => {
                          setLogFilters({ ...logFilters, page: logTotalPages });
                          setTimeout(fetchLogs, 100);
                        }}
                        disabled={logFilters.page === logTotalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Last</span>
                        <ChevronRightIcon className="h-5 w-5" />
                        <ChevronRightIcon className="h-5 w-5 -ml-3" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Channel Details Modal */}
      {showChannelModal && selectedChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="text-xl font-bold text-gray-900">Channel Details</h3>
              <button
                onClick={() => setShowChannelModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6">
              {/* Channel Header */}
              <div className="flex items-start space-x-4 mb-6">
                {selectedChannel.thumbnailUrl ? (
                  <img
                    src={selectedChannel.thumbnailUrl}
                    alt={selectedChannel.title}
                    className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-gray-200 flex items-center justify-center">
                    <UserGroupIcon className="h-10 w-10 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <h4 className="text-2xl font-bold text-gray-900">{selectedChannel.title || 'Unknown'}</h4>
                  <p className="text-gray-600 mt-1">{selectedChannel.customUrl || selectedChannel.channelId || 'N/A'}</p>
                  <div className="flex space-x-2 mt-2">
                    {selectedChannel.hasEmails && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        Has Emails
                      </span>
                    )}
                    {selectedChannel.hasHighSubscribers && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        50k+ Subscribers
                      </span>
                    )}
                    <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                      Saved: {selectedChannel.savedReason || 'emails'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Subscribers</p>
                  <p className="text-xl font-bold text-gray-900">{selectedChannel.subscriberCount?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Videos</p>
                  <p className="text-xl font-bold text-gray-900">{selectedChannel.videoCount?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Views</p>
                  <p className="text-xl font-bold text-gray-900">{selectedChannel.viewCount?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Emails Found</p>
                  <p className="text-xl font-bold text-gray-900">{selectedChannel.emails?.length || 0}</p>
                </div>
              </div>

              {/* Description */}
              {selectedChannel.description && (
                <div className="mb-6">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Description</h5>
                  <p className="text-gray-600 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                    {selectedChannel.description}
                  </p>
                </div>
              )}

              {/* Emails */}
              {selectedChannel.emails?.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <EnvelopeIcon className="h-4 w-4 mr-1 text-gray-500" />
                    Extracted Emails
                  </h5>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      {selectedChannel.emails.map((email, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-blue-700">{email}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(email);
                              toast.success('Email copied to clipboard');
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Copy
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Keywords */}
              {selectedChannel.keywords?.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Keywords</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedChannel.keywords.map((keyword, idx) => (
                      <span key={idx} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="border-t border-gray-200 pt-4">
                <h5 className="text-sm font-medium text-gray-700 mb-3">Additional Information</h5>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-sm text-gray-500">Channel ID</dt>
                  <dd className="text-sm text-gray-900 font-mono">{selectedChannel.channelId || 'N/A'}</dd>
                  
                  <dt className="text-sm text-gray-500">Country</dt>
                  <dd className="text-sm text-gray-900">{selectedChannel.country || 'N/A'}</dd>
                  
                  <dt className="text-sm text-gray-500">Published At</dt>
                  <dd className="text-sm text-gray-900">
                    {selectedChannel.publishedAt ? format(new Date(selectedChannel.publishedAt), 'PPpp') : 'N/A'}
                  </dd>
                  
                  <dt className="text-sm text-gray-500">Scraped At</dt>
                  <dd className="text-sm text-gray-900">
                    {selectedChannel.scrapedAt ? format(new Date(selectedChannel.scrapedAt), 'PPpp') : 'N/A'}
                  </dd>
                </dl>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowChannelModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedChannel, null, 2));
                  toast.success('Channel data copied to clipboard');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Copy Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;