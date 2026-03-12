// src/components/charts/ChannelChart.jsx
import React from 'react';
import { Bar } from 'react-chartjs-2';

export const ChannelChart = ({ stats }) => {
  const data = {
    labels: ['With Emails', '50k+ Subs', 'Both', 'Has Website', 'Has Social'],
    datasets: [{
      label: 'Channels',
      data: [
        stats.channelsWithEmails || 0,
        stats.channelsWithHighSubs || 0,
        stats.channelsWithBoth || 0,
        stats.channelsWithWebsite || 0,
        stats.channelsWithSocial || 0
      ],
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(236, 72, 153, 0.8)'
      ],
      borderRadius: 8
    }]
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { display: true, color: 'rgba(0,0,0,0.05)' }
      },
      x: {
        grid: { display: false }
      }
    }
  };

  return <Bar data={data} options={options} />;
};