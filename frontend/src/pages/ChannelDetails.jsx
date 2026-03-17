// src/pages/ChannelDetails.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  UserGroupIcon,
  EnvelopeIcon,
  LinkIcon,
  GlobeAltIcon,
  CalendarIcon,
  ClockIcon,
  StarIcon,
  ChartBarIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
  XCircleIcon,
  PhotoIcon,
  TagIcon,
  MapPinIcon,
  LanguageIcon,
  HashtagIcon,
  EyeIcon,
  FilmIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { api } from '../services/api';
import { Loader } from '../components/common/Loader';

export const ChannelDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchChannelDetails();
  }, [id]);

  const fetchChannelDetails = async () => {
    setLoading(true);
    try {
      const data = await api.getChannel(id);
      setChannel(data);
    } catch (error) {
      toast.error('Failed to fetch channel details');
      navigate('/channels');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getQualityScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getEngagementRateColor = (rate) => {
    if (rate >= 0.5) return 'text-green-600';
    if (rate >= 0.3) return 'text-blue-600';
    if (rate >= 0.1) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Channel not found</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: ChartBarIcon },
    { id: 'contact', name: 'Contact Info', icon: EnvelopeIcon },
    { id: 'stats', name: 'Statistics', icon: UserGroupIcon },
    { id: 'metadata', name: 'Metadata', icon: TagIcon }
  ];

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/channels')}
            className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            <span>Back to Channels</span>
          </button>
          
          <div className="flex items-center space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              channel.savedReason === 'both' ? 'bg-purple-100 text-purple-800' :
              channel.savedReason === 'emails' ? 'bg-blue-100 text-blue-800' :
              channel.savedReason === 'quality' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              Saved: {channel.savedReason}
            </span>
          </div>
        </div>

        {/* Channel Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
          {channel.thumbnailUrl ? (
            <img
              src={channel.thumbnailUrl}
              alt={channel.title}
              className="h-24 w-24 rounded-full object-cover border-4 border-gray-200"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {channel.title?.charAt(0) || '?'}
              </span>
            </div>
          )}
          
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{channel.title}</h1>
            <p className="text-gray-600 mt-1 flex items-center">
              <HashtagIcon className="h-4 w-4 mr-1 text-gray-400" />
              {channel.customUrl || channel.channelId}
            </p>
            
            <div className="flex flex-wrap gap-3 mt-4">
              {channel.hasEmails && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  <EnvelopeIcon className="h-4 w-4 mr-1" />
                  Has Emails ({channel.emails?.length})
                </span>
              )}
              {channel.hasHighSubscribers && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                  <UserGroupIcon className="h-4 w-4 mr-1" />
                  50k+ Subscribers
                </span>
              )}
              {channel.contactInfo?.hasWebsite && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-800">
                  <GlobeAltIcon className="h-4 w-4 mr-1" />
                  Has Website
                </span>
              )}
              {channel.contactInfo?.hasSocial && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-orange-100 text-orange-800">
                  <LinkIcon className="h-4 w-4 mr-1" />
                  Social Media
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStatCard
          icon={UserGroupIcon}
          label="Subscribers"
          value={channel.subscriberCount?.toLocaleString()}
          color="blue"
        />
        <QuickStatCard
          icon={FilmIcon}
          label="Videos"
          value={channel.videoCount?.toLocaleString()}
          color="green"
        />
        <QuickStatCard
          icon={EyeIcon}
          label="Views"
          value={channel.viewCount?.toLocaleString()}
          color="purple"
        />
        <QuickStatCard
          icon={EnvelopeIcon}
          label="Emails Found"
          value={channel.emails?.length || 0}
          color="orange"
        />
      </div>

      {/* Quality Score Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <StarIcon className="h-5 w-5 mr-2 text-yellow-500" />
            Quality Score
          </h3>
          <span className={`text-2xl font-bold ${getQualityScoreColor(channel.qualityScore)}`}>
            {channel.qualityScore || 0}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${channel.qualityScore || 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Poor</span>
          <span>Average</span>
          <span>Good</span>
          <span>Excellent</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Description */}
            {channel.description && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                <p className="text-gray-600 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap">
                  {channel.description}
                </p>
              </div>
            )}

            {/* Engagement Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MetricCard
                title="Engagement Rate"
                value={`${(channel.engagement?.engagementRate * 100 || 0).toFixed(2)}%`}
                color={getEngagementRateColor(channel.engagement?.engagementRate)}
                subtitle="Views per subscriber ratio"
                icon={ChartBarIcon}
              />
              <MetricCard
                title="Avg Views per Video"
                value={(channel.engagement?.avgViewsPerVideo || 0).toLocaleString()}
                color="text-blue-600"
                subtitle="Average views across all videos"
                icon={EyeIcon}
              />
            </div>

            {/* Keywords */}
            {channel.keywords?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {channel.keywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'contact' && (
          <div className="space-y-6">
            {/* Emails */}
            {channel.emails?.length > 0 ? (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <EnvelopeIcon className="h-5 w-5 mr-2 text-blue-500" />
                  Email Addresses ({channel.emails.length})
                </h4>
                <div className="space-y-2">
                  {channel.emails.map((email, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                    >
                      <span className="text-blue-700 font-mono">{email}</span>
                      <button
                        onClick={() => copyToClipboard(email)}
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Copy email"
                      >
                        <DocumentDuplicateIcon className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <EnvelopeIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p>No emails found for this channel</p>
              </div>
            )}

            {/* Website */}
            {channel.websiteUrl && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <GlobeAltIcon className="h-5 w-5 mr-2 text-green-500" />
                  Website
                </h4>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <a
                    href={channel.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:text-green-900 hover:underline truncate"
                  >
                    {channel.websiteUrl}
                  </a>
                  <button
                    onClick={() => copyToClipboard(channel.websiteUrl)}
                    className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-lg transition-colors"
                    title="Copy URL"
                  >
                    <DocumentDuplicateIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Social Links */}
            {channel.socialLinks?.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <LinkIcon className="h-5 w-5 mr-2 text-purple-500" />
                  Social Media
                </h4>
                <div className="space-y-2">
                  {channel.socialLinks.map((link, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-purple-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-2">
                        <ComputerDesktopIcon className="h-5 w-5 text-purple-600" />
                        <span className="text-purple-700 capitalize">{link.platform}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:text-purple-800 hover:underline text-sm truncate max-w-xs"
                        >
                          {link.url}
                        </a>
                        <button
                          onClick={() => copyToClipboard(link.url)}
                          className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-lg transition-colors"
                        >
                          <DocumentDuplicateIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatDetailCard
                icon={UserGroupIcon}
                label="Subscribers"
                value={channel.subscriberCount?.toLocaleString()}
                change="Total subscribers"
                color="blue"
              />
              <StatDetailCard
                icon={FilmIcon}
                label="Videos"
                value={channel.videoCount?.toLocaleString()}
                change="Total videos"
                color="green"
              />
              <StatDetailCard
                icon={EyeIcon}
                label="Views"
                value={channel.viewCount?.toLocaleString()}
                change="Total views"
                color="purple"
              />
              <StatDetailCard
                icon={ChartBarIcon}
                label="Avg Views/Video"
                value={Math.round(channel.viewCount / (channel.videoCount || 1)).toLocaleString()}
                change="Per video average"
                color="orange"
              />
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Engagement Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <EngagementMeter
                  label="Engagement Rate"
                  value={channel.engagement?.engagementRate || 0}
                  max={1}
                  unit="%"
                  color="blue"
                />
                <EngagementMeter
                  label="Quality Score"
                  value={channel.qualityScore || 0}
                  max={100}
                  unit=""
                  color="purple"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="space-y-6">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
              <MetadataItem
                label="Channel ID"
                value={channel.channelId}
                icon={HashtagIcon}
                onCopy={() => copyToClipboard(channel.channelId)}
              />
              <MetadataItem
                label="Country"
                value={channel.country || 'Not specified'}
                icon={MapPinIcon}
              />
              <MetadataItem
                label="Published At"
                value={channel.publishedAt ? format(new Date(channel.publishedAt), 'PPpp') : 'N/A'}
                icon={CalendarIcon}
              />
              <MetadataItem
                label="Scraped At"
                value={channel.scrapedAt ? format(new Date(channel.scrapedAt), 'PPpp') : 'N/A'}
                icon={ClockIcon}
              />
              <MetadataItem
                label="Language"
                value={channel.language || 'Not specified'}
                icon={LanguageIcon}
              />
              <MetadataItem
                label="Category"
                value={channel.category || 'Not specified'}
                icon={TagIcon}
              />
            </dl>

            {/* Contact Info Summary */}
            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Contact Information Summary</h4>
              <div className="grid grid-cols-3 gap-4">
                <ContactSummary
                  label="Has Emails"
                  value={channel.hasEmails}
                  icon={EnvelopeIcon}
                />
                <ContactSummary
                  label="Has Website"
                  value={channel.contactInfo?.hasWebsite}
                  icon={GlobeAltIcon}
                />
                <ContactSummary
                  label="Has Social Media"
                  value={channel.contactInfo?.hasSocial}
                  icon={LinkIcon}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Quick Stat Card Component
const QuickStatCard = ({ icon: Icon, label, value, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center space-x-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ title, value, color, subtitle, icon: Icon }) => (
  <div className="bg-gray-50 p-4 rounded-lg">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-600">{title}</span>
      <Icon className={`h-5 w-5 ${color}`} />
    </div>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
  </div>
);

// Stat Detail Card
const StatDetailCard = ({ icon: Icon, label, value, change, color }) => {
  const colors = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600'
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <div className="flex items-center space-x-2 mb-2">
        <Icon className={`h-5 w-5 ${colors[color]}`} />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{change}</p>
    </div>
  );
};

// Engagement Meter
const EngagementMeter = ({ label, value, max, unit, color }) => {
  const percentage = (value / max) * 100;
  
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className={`text-sm font-medium text-${color}-600`}>
          {(value * (unit === '%' ? 100 : 1)).toFixed(1)}{unit}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`bg-${color}-600 h-2 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// Metadata Item
const MetadataItem = ({ label, value, icon: Icon, onCopy }) => (
  <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
    <Icon className="h-5 w-5 text-gray-400 mt-0.5" />
    <div className="flex-1">
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900 break-all">{value}</p>
        {onCopy && (
          <button
            onClick={onCopy}
            className="ml-2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
            title="Copy"
          >
            <DocumentDuplicateIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  </div>
);

// Contact Summary
const ContactSummary = ({ label, value, icon: Icon }) => (
  <div className="text-center">
    <div className={`inline-flex p-2 rounded-full ${value ? 'bg-green-100' : 'bg-gray-100'}`}>
      <Icon className={`h-6 w-6 ${value ? 'text-green-600' : 'text-gray-400'}`} />
    </div>
    <p className={`text-sm mt-2 ${value ? 'text-gray-900' : 'text-gray-500'}`}>
      {label}
    </p>
    <p className={`text-xs ${value ? 'text-green-600' : 'text-gray-400'}`}>
      {value ? 'Yes' : 'No'}
    </p>
  </div>
);

export default ChannelDetails;