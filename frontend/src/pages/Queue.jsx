// src/pages/Queue.jsx
import React, { useState, useEffect } from 'react';
import {
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ServerStackIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Pagination } from '../components/common/Pagination';
import { Loader } from '../components/common/Loader';

export const Queue = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({});
  const { workerStatus } = useSocket();

  useEffect(() => {
    fetchQueue();
    fetchStats();
  }, [page]);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const data = await api.getQueue(page);
      setTasks(data.queue);
      setTotalPages(Math.ceil(data.total / 10));
    } catch (error) {
      toast.error('Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data.queueStats || {});
    } catch (error) {
      console.error('Failed to fetch stats');
    }
  };

  const cancelTask = async (taskId) => {
    if (!confirm('Are you sure you want to cancel this task?')) return;

    try {
      await api.cancelTask(taskId);
      toast.success('Task cancelled');
      fetchQueue();
    } catch (error) {
      toast.error('Failed to cancel task');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      completed: 'bg-green-100 text-green-800',
      processing: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800'
    };
    return colors[status] || colors.pending;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleIcon className="h-4 w-4" />;
      case 'processing': return <ArrowPathIcon className="h-4 w-4 animate-spin" />;
      case 'failed': return <XCircleIcon className="h-4 w-4" />;
      case 'cancelled': return <XCircleIcon className="h-4 w-4" />;
      default: return <ClockIcon className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Queue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <QueueStatCard
          label="Pending"
          value={stats.pending || 0}
          color="yellow"
          icon={ClockIcon}
        />
        <QueueStatCard
          label="Processing"
          value={stats.processing || 0}
          color="blue"
          icon={ArrowPathIcon}
        />
        <QueueStatCard
          label="Completed"
          value={stats.completed || 0}
          color="green"
          icon={CheckCircleIcon}
        />
        <QueueStatCard
          label="Failed"
          value={stats.failed || 0}
          color="red"
          icon={XCircleIcon}
        />
        <QueueStatCard
          label="Cancelled"
          value={stats.cancelled || 0}
          color="gray"
          icon={XCircleIcon}
        />
      </div>

      {/* Worker Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-2 rounded-lg ${
              workerStatus.isProcessing ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <ServerStackIcon className={`h-6 w-6 ${
                workerStatus.isProcessing ? 'text-blue-600' : 'text-gray-600'
              }`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Worker Status</p>
              <p className="text-xs text-gray-500">
                {workerStatus.isProcessing ? 'Processing tasks' : 'Idle'} ·{' '}
                {workerStatus.tasksProcessed} tasks processed
              </p>
            </div>
          </div>
          {workerStatus.lastProcessed && (
            <p className="text-sm text-gray-500">
              Last processed: {format(new Date(workerStatus.lastProcessed), 'HH:mm:ss')}
            </p>
          )}
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8"><Loader /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filters</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tasks.map(task => (
                    <tr key={task._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">
                        {task._id?.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {task.task}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                          {getStatusIcon(task.status)}
                          <span>{task.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {task.stats ? (
                          <div className="text-sm">
                            <p className="font-medium">Saved: {task.stats.channelsSaved || 0}</p>
                            <p className="text-xs text-gray-500">
                              Scraped: {task.stats.channelsScraped || 0} | 
                              Emails: {task.stats.emailsFound || 0}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not started</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {task.data && (
                          <div className="space-y-1">
                            {task.data.countryCode && (
                              <span className="inline-flex px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                                {task.data.countryCode}
                              </span>
                            )}
                            <p className="text-xs text-gray-600">
                              Subs: {task.data.minSubscribers?.toLocaleString()}+
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {task.createdAt ? format(new Date(task.createdAt), 'MMM d, HH:mm') : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        {task.status === 'pending' && (
                          <button
                            onClick={() => cancelTask(task._id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
};

const QueueStatCard = ({ label, value, color, icon: Icon }) => {
  const colors = {
    yellow: 'bg-yellow-100 text-yellow-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-600'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};