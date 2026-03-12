// src/pages/Logs.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  FunnelIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import DatePicker from 'react-datepicker';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Pagination } from '../components/common/Pagination';
import { Loader } from '../components/common/Loader';
import "react-datepicker/dist/react-datepicker.css";

export const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [logStats, setLogStats] = useState({});
  const logsEndRef = useRef(null);
  const { lastLogs } = useSocket();
  
  const [filters, setFilters] = useState({
    page: 1,
    limit: 50,
    level: '',
    source: '',
    startDate: null,
    endDate: null
  });

  useEffect(() => {
    fetchLogs();
  }, [filters.page]);

  useEffect(() => {
    if (lastLogs) {
      setLogs(prev => [...lastLogs, ...prev].slice(0, 200));
    }
  }, [lastLogs]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getLogs(filters);
      setLogs(data.logs);
      setTotalPages(data.pages);
      setLogStats(data.stats);
    } catch (error) {
      toast.error('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    setFilters({ ...filters, page: 1 });
    fetchLogs();
  };

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear all logs?')) return;

    try {
      await api.clearLogs();
      toast.success('Logs cleared');
      setLogs([]);
      setLogStats({});
    } catch (error) {
      toast.error('Failed to clear logs');
    }
  };

  const getLogColor = (level) => {
    const colors = {
      error: 'bg-red-900/20 text-red-300 border-red-500',
      success: 'bg-green-900/20 text-green-300 border-green-500',
      warning: 'bg-yellow-900/20 text-yellow-300 border-yellow-500',
      debug: 'bg-purple-900/20 text-purple-300 border-purple-500',
      info: 'bg-blue-900/20 text-blue-300 border-blue-500'
    };
    return colors[level] || colors.info;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <FunnelIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-medium text-gray-900">Log Filters</h3>
          </div>
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
          >
            <TrashIcon className="h-5 w-5" />
            <span>Clear All Logs</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Log Level</label>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
              value={filters.source}
              onChange={(e) => setFilters({ ...filters, source: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
              selected={filters.startDate}
              onChange={(date) => setFilters({ ...filters, startDate: date })}
              placeholderText="Select start date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              dateFormat="yyyy-MM-dd"
              isClearable
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
            <DatePicker
              selected={filters.endDate}
              onChange={(date) => setFilters({ ...filters, endDate: date })}
              placeholderText="Select end date"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              dateFormat="yyyy-MM-dd"
              isClearable
              minDate={filters.startDate}
            />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
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
            {logs.length} logs • Auto-refresh
          </span>
        </div>

        {loading ? (
          <div className="p-8"><Loader /></div>
        ) : (
          <div className="p-4 h-[600px] overflow-y-auto font-mono text-sm">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={`mb-2 p-3 rounded border-l-4 ${getLogColor(log?.level)}`}
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
              </div>
            ))}
            <div ref={logsEndRef} />
            {logs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No logs available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {logs.length > 0 && (
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      )}
    </div>
  );
};