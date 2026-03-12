// src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PlayIcon,
  UserGroupIcon,
  EnvelopeIcon,
  StarIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket.jsx';
import { ChannelChart } from '../components/charts/ChannelChart';
import { QueueChart } from '../components/charts/QueueChart';
import { Loader } from '../components/common/Loader';

export const Dashboard = () => {
  const [stats, setStats] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scrapeForm, setScrapeForm] = useState({
    keywords: '',
    count: 1000,
    countryCode: '',
    minSubscribers: 5000,
    minEngagement: 0.1,
    qualityThreshold: 50
  });
  const [countries, setCountries] = useState([]);
  const { lastLogs } = useSocket();

  useEffect(() => {
    fetchStats();
    fetchCountries();
  }, []);

  useEffect(() => {
    if (lastLogs) {
      setLogs(prev => [...lastLogs.slice(-20), ...prev].slice(-20));
    }
  }, [lastLogs]);

  const fetchStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data);
    } catch (error) {
      toast.error('Failed to fetch stats');
    }
  };

  const fetchCountries = async () => {
    try {
      const data = await api.getCountries();
      setCountries(data);
    } catch (error) {
      console.error('Failed to fetch countries');
    }
  };

  const startScrape = async () => {
    if (!scrapeForm.keywords.trim()) {
      toast.error('Please enter keywords');
      return;
    }

    setLoading(true);
    try {
      const keywords = scrapeForm.keywords.split(',').map(k => k.trim()).filter(k => k);
      await api.startScrape({
        keywords,
        count: parseInt(scrapeForm.count),
        countryCode: scrapeForm.countryCode || null,
        minSubscribers: parseInt(scrapeForm.minSubscribers),
        minEngagement: parseFloat(scrapeForm.minEngagement),
        qualityThreshold: parseInt(scrapeForm.qualityThreshold)
      });
      
      toast.success('Scrape task queued successfully');
      setScrapeForm({ ...scrapeForm, keywords: '' });
    } catch (error) {
      toast.error(error.message || 'Failed to start scrape');
    } finally {
      setLoading(false);
    }
  };

  const safeStats = {
    totalChannels: stats.totalChannels || 0,
    todayChannels: stats.todayChannels || 0,
    channelsWithEmails: stats.channelsWithEmails || 0,
    channelsWithHighSubs: stats.channelsWithHighSubs || 0,
    channelsWithBoth: stats.channelsWithBoth || 0,
    totalEmails: stats.totalEmails || 0,
    avgQualityScore: stats.qualityStats?.avgQuality || 0,
    queueStats: stats.queueStats || { pending: 0, processing: 0, completed: 0, failed: 0 },
    saveRate: stats.saveRate || '0%'
  };

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Channels"
          value={safeStats.totalChannels.toLocaleString()}
          change={`+${safeStats.todayChannels} today`}
          icon={UserGroupIcon}
          color="blue"
        />
        <StatCard
          title="With Emails"
          value={safeStats.channelsWithEmails.toLocaleString()}
          subtext={`${safeStats.totalEmails.toLocaleString()} total emails`}
          icon={EnvelopeIcon}
          color="green"
        />
        <StatCard
          title="Avg Quality Score"
          value={safeStats.avgQualityScore.toFixed(1)}
          subtext={`Save rate: ${safeStats.saveRate}`}
          icon={StarIcon}
          color="purple"
        />
        <StatCard
          title="Queue Status"
          value={safeStats.queueStats.pending}
          subtext={`${safeStats.queueStats.processing} processing`}
          icon={ClockIcon}
          color="orange"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Channel Distribution</h3>
          <div className="h-80">
            <ChannelChart stats={safeStats} />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Queue Status</h3>
          <div className="h-80">
            <QueueChart queueStats={safeStats.queueStats} />
          </div>
        </div>
      </div>

      {/* Scrape Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <PlayIcon className="h-5 w-5 mr-2 text-blue-600" />
          Start New Scrape
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Keywords <span className="text-gray-400">(comma separated)</span>
            </label>
            <input
              type="text"
              value={scrapeForm.keywords}
              onChange={(e) => setScrapeForm({ ...scrapeForm, keywords: e.target.value })}
              placeholder="technology, business, gaming, education..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Country
            </label>
            <select
              value={scrapeForm.countryCode}
              onChange={(e) => setScrapeForm({ ...scrapeForm, countryCode: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Worldwide</option>
              {countries.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Subscribers
            </label>
            <input
              type="number"
              value={scrapeForm.minSubscribers}
              onChange={(e) => setScrapeForm({ ...scrapeForm, minSubscribers: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quality Threshold
            </label>
            <input
              type="number"
              value={scrapeForm.qualityThreshold}
              onChange={(e) => setScrapeForm({ ...scrapeForm, qualityThreshold: e.target.value })}
              min="0"
              max="100"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={startScrape}
          disabled={loading}
          className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
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

      {/* Recent Logs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
          <Link to="/logs" className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
            View All <ChevronRightIcon className="h-4 w-4 ml-1" />
          </Link>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.map((log, idx) => (
            <LogEntry key={idx} log={log} />
          ))}
          {logs.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No logs available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, change, subtext, icon: Icon, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="h-8 w-8" />
        </div>
      </div>
      {change && <p className="text-sm text-green-600 mt-2">{change}</p>}
      {subtext && <p className="text-sm text-gray-600 mt-2">{subtext}</p>}
    </div>
  );
};

// Log Entry Component
const LogEntry = ({ log }) => {
  const colors = {
    error: 'bg-red-50 text-red-700 border-red-500',
    success: 'bg-green-50 text-green-700 border-green-500',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-500',
    debug: 'bg-purple-50 text-purple-700 border-purple-500',
    info: 'bg-blue-50 text-blue-700 border-blue-500'
  };

  return (
    <div className={`p-3 rounded-lg text-sm border-l-4 ${colors[log.level] || colors.info}`}>
      <div className="flex items-start">
        <span className="font-mono text-xs opacity-75 min-w-[70px]">
          {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '--:--:--'}
        </span>
        <span className="ml-2 font-medium">{log.message}</span>
      </div>
    </div>
  );
};