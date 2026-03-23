import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { 
  FiRefreshCw, FiPlay, FiUsers, FiMail, FiVideo, 
  FiTrendingUp, FiClock, FiCheckCircle, FiXCircle,
  FiLoader, FiDownload, FiSearch, FiEye, FiThumbsUp,
  FiBarChart2, FiActivity, FiDatabase, FiZap, FiArrowRight,
  FiGlobe, FiCpu, FiTarget, FiAward, FiCalendar, FiServer
} from 'react-icons/fi';

const API_BASE_URL = 'https://api.heekentertainment.com/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [scrapers, setScrapers] = useState([]);
  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('queue');
  const socketRef = useRef(null);
  
  const [formData, setFormData] = useState({
    keywords: '',
    count: 10000,
    countryCode: '',
    minSubscribers: 1000,
    includeRelated: true,
    relatedDepth: 2,
    enrichKeywords: true,
  });
  
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    fetchData();
    fetchCountries();
    setupSocket();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const setupSocket = () => {
    socketRef.current = io('https://api.heekentertainment.com');
    
    socketRef.current.on('log', (log) => {
      setLogs(prev => [log, ...prev].slice(0, 200));
    });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, scrapersRes, queueRes] = await Promise.all([
        fetch(`${API_BASE_URL}/stats`).then(res => res.json()),
        fetch(`${API_BASE_URL}/scrapers`).then(res => res.json()),
        fetch(`${API_BASE_URL}/queue`).then(res => res.json()),
      ]);
      
      setStats(statsRes);
      setScrapers(scrapersRes);
      setQueue(queueRes);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchCountries = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/countries`);
      const data = await res.json();
      setCountries(data);
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const keywordsArray = formData.keywords.split(',').map(k => k.trim()).filter(k => k);
    if (keywordsArray.length === 0) {
      toast.error('Please enter at least one keyword');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: keywordsArray,
          count: parseInt(formData.count),
          countryCode: formData.countryCode || null,
          minSubscribers: parseInt(formData.minSubscribers),
          includeRelated: formData.includeRelated,
          relatedDepth: parseInt(formData.relatedDepth),
          enrichKeywords: formData.enrichKeywords,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success('Scrape task started successfully!');
        setFormData({
          keywords: '',
          count: 10000,
          countryCode: '',
          minSubscribers: 1000,
          includeRelated: true,
          relatedDepth: 2,
          enrichKeywords: true,
        });
        fetchData();
      } else {
        toast.error(data.error || 'Failed to start scrape');
      }
    } catch (error) {
      console.error('Error starting scrape:', error);
      toast.error('Failed to start scrape task');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'processing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getLogStyle = (level) => {
    switch(level) {
      case 'success': return 'border-emerald-500/30 bg-emerald-500/5';
      case 'error': return 'border-red-500/30 bg-red-500/5';
      case 'warning': return 'border-amber-500/30 bg-amber-500/5';
      case 'info': return 'border-blue-500/30 bg-blue-500/5';
      default: return 'border-gray-500/30 bg-gray-500/5';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <FiZap className="text-blue-500 text-xl animate-pulse" />
            </div>
          </div>
          <p className="text-gray-400 mt-4 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0f0f0f]/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Scraper Dashboard
              </h1>
              <p className="text-gray-500 text-sm mt-1">Monitor and manage your lead generation</p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/creators"
                className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-gray-300 text-sm"
              >
                <FiUsers className="w-4 h-4" />
                View Creators
                <FiArrowRight className="w-3 h-3" />
              </Link>
              <button
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 transition-all text-gray-300 text-sm"
              >
                <FiRefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <FiUsers className="text-blue-400 text-xl" />
              </div>
              <span className="text-xs text-gray-500">Total Channels</span>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.totalChannels?.toLocaleString() || 0}</p>
            <p className="text-xs text-gray-500 mt-2">discovered channels</p>
          </div>
          
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <FiMail className="text-emerald-400 text-xl" />
              </div>
              <span className="text-xs text-gray-500">Email Leads</span>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.totalEmails?.toLocaleString() || 0}</p>
            <p className="text-xs text-gray-500 mt-2">valid email addresses</p>
          </div>
          
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <FiTarget className="text-purple-400 text-xl" />
              </div>
              <span className="text-xs text-gray-500">Success Rate</span>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.saveRate || '0%'}</p>
            <p className="text-xs text-gray-500 mt-2">channels with emails</p>
          </div>
          
          <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <FiCalendar className="text-orange-400 text-xl" />
              </div>
              <span className="text-xs text-gray-500">Today's Growth</span>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.todayChannels?.toLocaleString() || 0}</p>
            <p className="text-xs text-gray-500 mt-2">new channels today</p>
          </div>
        </div>

        {/* Main Grid - Form + Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Section */}
          <div className="lg:col-span-1">
            <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl sticky top-24">
              <div className="p-5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg">
                    <FiPlay className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">New Scrape Task</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Configure your scraping parameters</p>
                  </div>
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Keywords *
                  </label>
                  <textarea
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="gaming, cooking, tech tutorials, fitness"
                    rows="3"
                    className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white placeholder-gray-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Separate multiple keywords with commas</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Max Channels
                    </label>
                    <input
                      type="number"
                      value={formData.count}
                      onChange={(e) => setFormData({ ...formData, count: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white"
                      min="100"
                      max="50000"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Min Subscribers
                    </label>
                    <input
                      type="number"
                      value={formData.minSubscribers}
                      onChange={(e) => setFormData({ ...formData, minSubscribers: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white"
                      min="0"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Country Filter
                    </label>
                    <select
                      value={formData.countryCode}
                      onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white"
                    >
                      <option value="">All Countries</option>
                      {countries.map(c => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Related Depth
                    </label>
                    <input
                      type="number"
                      value={formData.relatedDepth}
                      onChange={(e) => setFormData({ ...formData, relatedDepth: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-white"
                      min="1"
                      max="5"
                    />
                  </div>
                </div>
                
                <div className="space-y-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.includeRelated}
                      onChange={(e) => setFormData({ ...formData, includeRelated: e.target.checked })}
                      className="w-4 h-4 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500 focus:ring-offset-0 text-blue-500"
                    />
                    <span className="text-sm text-gray-300">Include related channels</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enrichKeywords}
                      onChange={(e) => setFormData({ ...formData, enrichKeywords: e.target.checked })}
                      className="w-4 h-4 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500 focus:ring-offset-0 text-blue-500"
                    />
                    <span className="text-sm text-gray-300">Enrich keywords with suggestions</span>
                  </label>
                </div>
                
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 text-sm font-medium shadow-lg shadow-blue-500/20"
                >
                  {submitting ? (
                    <>
                      <FiLoader className="animate-spin" />
                      Starting Scraper...
                    </>
                  ) : (
                    <>
                      <FiZap className="w-4 h-4" />
                      Start Scraping
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
          
          {/* Right Side Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-800">
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-4 py-2 text-sm font-medium transition-all relative ${
                  activeTab === 'queue' 
                    ? 'text-white' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FiActivity className="w-4 h-4" />
                  Task Queue
                </div>
                {activeTab === 'queue' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 text-sm font-medium transition-all relative ${
                  activeTab === 'logs' 
                    ? 'text-white' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FiClock className="w-4 h-4" />
                  Live Logs
                </div>
                {activeTab === 'logs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"></div>
                )}
              </button>
            </div>

            {/* Queue Content */}
            {activeTab === 'queue' && (
              <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl">
                <div className="p-5 border-b border-gray-800">
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                      <span className="text-gray-400">Pending: {queue?.stats?.pending || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-gray-400">Processing: {queue?.stats?.processing || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                      <span className="text-gray-400">Completed: {queue?.stats?.completed || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-gray-400">Failed: {queue?.stats?.failed || 0}</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {queue?.queue?.slice(0, 15).map((task) => (
                    <div key={task._id} className="p-4 bg-[#1a1a1a] rounded-xl border border-gray-800 hover:border-gray-700 transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 text-xs rounded-full border ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(task.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {task.stats && (
                          <div className="flex gap-3 text-xs">
                            <span className="text-emerald-400">📧 {task.stats.emailsFound || 0}</span>
                            <span className="text-blue-400">📺 {task.stats.channelsSaved || 0}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium text-white">
                        {task.data?.keywords?.slice(0, 5).join(', ')}
                        {task.data?.keywords?.length > 5 && ` +${task.data.keywords.length - 5} more`}
                      </p>
                      {task.error && (
                        <p className="text-xs text-red-400 mt-2">Error: {task.error}</p>
                      )}
                    </div>
                  ))}
                  
                  {(!queue?.queue || queue.queue.length === 0) && (
                    <div className="text-center py-12">
                      <div className="inline-flex p-4 bg-gray-800/30 rounded-full mb-4">
                        <FiDatabase className="text-3xl text-gray-600" />
                      </div>
                      <p className="text-gray-500">No tasks in queue</p>
                      <p className="text-xs text-gray-600 mt-1">Start a new scrape task to see activity</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Logs Content */}
            {activeTab === 'logs' && (
              <div className="bg-[#0f0f0f] border border-gray-800 rounded-xl">
                <div className="p-5 border-b border-gray-800">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-400">Real-time scraping activity</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-gray-500">Live</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 h-[500px] overflow-y-auto space-y-2 custom-scrollbar">
                  {logs.map((log, index) => (
                    <div key={index} className={`p-3 rounded-xl border-l-4 ${getLogStyle(log.level)} border-gray-700 bg-[#1a1a1a]`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-gray-500 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          log.level === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                          log.level === 'error' ? 'bg-red-500/20 text-red-400' :
                          log.level === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {log.level}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm">{log.message}</p>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <pre className="mt-2 text-xs text-gray-500 bg-black/30 p-2 rounded-lg overflow-x-auto font-mono">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                  
                  {logs.length === 0 && (
                    <div className="text-center py-12">
                      <div className="inline-flex p-4 bg-gray-800/30 rounded-full mb-4">
                        <FiActivity className="text-3xl text-gray-600" />
                      </div>
                      <p className="text-gray-500">No logs yet</p>
                      <p className="text-xs text-gray-600 mt-1">Start a scrape task to see activity</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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