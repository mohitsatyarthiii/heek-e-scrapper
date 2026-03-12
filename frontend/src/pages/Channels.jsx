// src/pages/Channels.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
  EyeIcon,
  EnvelopeIcon,
  LinkIcon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { api } from '../services/api';
import { Pagination } from '../components/common/Pagination';
import { StatusBadge } from '../components/common/StatusBadge';
import { Loader } from '../components/common/Loader';

export const Channels = () => {
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [countries, setCountries] = useState([]);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    hasEmails: '',
    hasHighSubscribers: '',
    hasWebsite: '',
    hasSocial: '',
    minSubscribers: '',
    maxSubscribers: '',
    minQuality: '',
    minEngagement: '',
    country: '',
    keyword: '',
    sortBy: 'qualityScore',
    sortOrder: 'desc'
  });

  useEffect(() => {
    fetchChannels();
    fetchCountries();
  }, [filters.page, filters.sortBy, filters.sortOrder]);

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

  const fetchCountries = async () => {
    try {
      const data = await api.getCountries();
      setCountries(data);
    } catch (error) {
      console.error('Failed to fetch countries');
    }
  };

  const applyFilters = () => {
    setFilters({ ...filters, page: 1 });
    fetchChannels();
  };

  const resetFilters = () => {
    setFilters({
      page: 1,
      limit: 10,
      hasEmails: '',
      hasHighSubscribers: '',
      hasWebsite: '',
      hasSocial: '',
      minSubscribers: '',
      maxSubscribers: '',
      minQuality: '',
      minEngagement: '',
      country: '',
      keyword: '',
      sortBy: 'qualityScore',
      sortOrder: 'desc'
    });
    setTimeout(fetchChannels, 100);
  };

  const exportChannels = async () => {
    try {
      const blob = await api.exportChannels();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `channels-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      toast.success('Channels exported successfully');
    } catch (error) {
      toast.error('Failed to export channels');
    }
  };

  const viewChannelDetails = (channelId) => {
    navigate(`/channels/${channelId}`);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-4 mb-4">
          <FunnelIcon className="h-5 w-5 text-gray-600" />
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect
            label="Email Status"
            value={filters.hasEmails}
            onChange={(e) => setFilters({ ...filters, hasEmails: e.target.value })}
            options={[
              { value: '', label: 'All Channels' },
              { value: 'true', label: 'Has Emails' },
              { value: 'false', label: 'No Emails' }
            ]}
          />

          <FilterSelect
            label="Website Status"
            value={filters.hasWebsite}
            onChange={(e) => setFilters({ ...filters, hasWebsite: e.target.value })}
            options={[
              { value: '', label: 'All Channels' },
              { value: 'true', label: 'Has Website' },
              { value: 'false', label: 'No Website' }
            ]}
          />

          <FilterSelect
            label="Social Media"
            value={filters.hasSocial}
            onChange={(e) => setFilters({ ...filters, hasSocial: e.target.value })}
            options={[
              { value: '', label: 'All Channels' },
              { value: 'true', label: 'Has Social' },
              { value: 'false', label: 'No Social' }
            ]}
          />

          <FilterInput
            label="Min Subscribers"
            value={filters.minSubscribers}
            onChange={(e) => setFilters({ ...filters, minSubscribers: e.target.value })}
            placeholder="e.g., 10000"
          />

          <FilterInput
            label="Min Quality Score"
            value={filters.minQuality}
            onChange={(e) => setFilters({ ...filters, minQuality: e.target.value })}
            placeholder="0-100"
            type="number"
          />

          <FilterInput
            label="Min Engagement"
            value={filters.minEngagement}
            onChange={(e) => setFilters({ ...filters, minEngagement: e.target.value })}
            placeholder="0.1 = 10%"
            step="0.05"
          />

          <FilterSelect
            label="Country"
            value={filters.country}
            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
            options={[
              { value: '', label: 'All Countries' },
              ...countries.map(c => ({ value: c.code, label: c.name }))
            ]}
          />

          <FilterInput
            label="Keyword"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            placeholder="Search by keyword"
          />

          <FilterSelect
            label="Sort By"
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            options={[
              { value: 'qualityScore', label: 'Quality Score' },
              { value: 'subscriberCount', label: 'Subscribers' },
              { value: 'engagement.engagementRate', label: 'Engagement Rate' },
              { value: 'scrapedAt', label: 'Date Scraped' }
            ]}
          />

          <FilterSelect
            label="Sort Order"
            value={filters.sortOrder}
            onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })}
            options={[
              { value: 'desc', label: 'Descending' },
              { value: 'asc', label: 'Ascending' }
            ]}
          />
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={resetFilters}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
          >
            <XCircleIcon className="h-5 w-5" />
            <span>Reset</span>
          </button>
          <button
            onClick={applyFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
          >
            <MagnifyingGlassIcon className="h-5 w-5" />
            <span>Apply Filters</span>
          </button>
          <button
            onClick={exportChannels}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Channels Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8"><Loader /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscribers</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quality</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Engagement</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saved Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {channels.map(channel => (
                    <tr key={channel._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {channel.thumbnailUrl ? (
                            <img src={channel.thumbnailUrl} alt={channel.title} className="h-10 w-10 rounded-full mr-3" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 mr-3 flex items-center justify-center">
                              <UserGroupIcon className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{channel.title}</div>
                            <div className="text-xs text-gray-500">{channel.customUrl || channel.channelId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{channel.subscriberCount?.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${channel.qualityScore || 0}%` }} />
                          </div>
                          <span className="text-sm">{channel.qualityScore || 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {channel.engagement?.engagementRate ? (channel.engagement.engagementRate * 100).toFixed(1) + '%' : 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-1">
                          {channel.hasEmails && <EnvelopeIcon className="h-5 w-5 text-blue-500" title="Has Emails" />}
                          {channel.contactInfo?.hasWebsite && <LinkIcon className="h-5 w-5 text-green-500" title="Has Website" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{channel.country || 'Global'}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={channel.savedReason} />
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => viewChannelDetails(channel._id)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={filters.page}
              totalPages={totalPages}
              onPageChange={(page) => setFilters({ ...filters, page })}
            />
          </>
        )}
      </div>
    </div>
  );
};

// Filter Components
const FilterSelect = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

const FilterInput = ({ label, value, onChange, placeholder, type = 'text', step }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      step={step}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
    />
  </div>
);