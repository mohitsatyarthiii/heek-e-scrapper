// src/hooks/useChannels.js
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { toast } from 'react-hot-toast';

export const useChannels = (initialFilters = {}) => {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [totalPages, setTotalPages] = useState(1);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await api.getChannels(filters);
      setChannels(data.channels);
      setTotalPages(data.pages);
    } catch (error) {
      toast.error('Failed to fetch channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [filters]);

  return {
    channels,
    loading,
    filters,
    setFilters,
    totalPages,
    refetch: fetchChannels
  };
};