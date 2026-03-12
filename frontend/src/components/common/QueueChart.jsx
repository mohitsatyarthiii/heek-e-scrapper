// src/components/charts/QueueChart.jsx
import React from 'react';
import { Pie } from 'react-chartjs-2';

export const QueueChart = ({ queueStats }) => {
  const data = {
    labels: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
    datasets: [{
      data: [
        queueStats.pending || 0,
        queueStats.processing || 0,
        queueStats.completed || 0,
        queueStats.failed || 0,
        queueStats.cancelled || 0
      ],
      backgroundColor: [
        'rgba(245, 158, 11, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(107, 114, 128, 0.8)'
      ],
      borderWidth: 0
    }]
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, padding: 20 }
      }
    }
  };

  return <Pie data={data} options={options} />;
};