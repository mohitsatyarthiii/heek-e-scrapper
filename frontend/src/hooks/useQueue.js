// src/hooks/useQueue.js
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { toast } from 'react-hot-toast';

export const useQueue = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({});

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const data = await api.getQueue(page);
      setTasks(data.queue);
      setTotalPages(Math.ceil(data.total / 10));
      setStats(data.stats);
    } catch (error) {
      toast.error('Failed to fetch queue');
    } finally {
      setLoading(false);
    }
  };

  const cancelTask = async (taskId) => {
    try {
      await api.cancelTask(taskId);
      toast.success('Task cancelled');
      fetchQueue();
    } catch (error) {
      toast.error('Failed to cancel task');
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [page]);

  return {
    tasks,
    loading,
    page,
    setPage,
    totalPages,
    stats,
    cancelTask,
    refetch: fetchQueue
  };
};