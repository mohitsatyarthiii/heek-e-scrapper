// src/components/common/StatusBadge.jsx
import React from 'react';

const statusConfig = {
  emails: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Has Emails' },
  subscribers: { bg: 'bg-green-100', text: 'text-green-800', label: '50k+ Subs' },
  quality: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'High Quality' },
  both: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Emails + Subs' },
  engagement: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'High Engagement' }
};

export const StatusBadge = ({ status }) => {
  const config = statusConfig[status] || statusConfig.emails;
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};