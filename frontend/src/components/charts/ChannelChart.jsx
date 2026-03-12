// src/components/charts/ChannelChart.jsx
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

export const ChannelChart = ({ stats }) => {
  const data = {
    labels: ['With Emails', '50k+ Subs', 'Both', 'Has Website', 'Has Social'],
    datasets: [
      {
        label: 'Number of Channels',
        data: [
          stats.channelsWithEmails || 0,
          stats.channelsWithHighSubs || 0,
          stats.channelsWithBoth || 0,
          stats.channelsWithWebsite || 0,
          stats.channelsWithSocial || 0
        ],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',  // Blue
          'rgba(16, 185, 129, 0.8)',  // Green
          'rgba(139, 92, 246, 0.8)',  // Purple
          'rgba(245, 158, 11, 0.8)',  // Orange
          'rgba(236, 72, 153, 0.8)'   // Pink
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(139, 92, 246)',
          'rgb(245, 158, 11)',
          'rgb(236, 72, 153)'
        ],
        borderWidth: 1,
        borderRadius: 8,
        barPercentage: 0.7,
        categoryPercentage: 0.8
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            let value = context.raw || 0;
            return `${label}: ${value.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false
        },
        ticks: {
          callback: function(value) {
            return value.toLocaleString();
          },
          font: {
            size: 11
          }
        }
      },
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11,
            weight: '500'
          }
        }
      }
    },
    layout: {
      padding: {
        top: 10,
        bottom: 10
      }
    }
  };

  // If no data, show empty state
  const hasData = Object.values(stats).some(value => value > 0);
  
  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  return <Bar data={data} options={options} />;
};

// Optional: Alternative Pie Chart Version
export const ChannelPieChart = ({ stats }) => {
  const data = {
    labels: ['With Emails', '50k+ Subs', 'Both', 'Has Website', 'Has Social'],
    datasets: [
      {
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
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(139, 92, 246)',
          'rgb(245, 158, 11)',
          'rgb(236, 72, 153)'
        ],
        borderWidth: 1
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            let label = context.label || '';
            let value = context.raw || 0;
            let total = context.dataset.data.reduce((a, b) => a + b, 0);
            let percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${label}: ${value.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    }
  };

  const hasData = Object.values(stats).some(value => value > 0);
  
  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  return <Pie data={data} options={options} />;
};

// Optional: Stacked Bar Chart for Comparison
export const ChannelStackedChart = ({ stats }) => {
  const data = {
    labels: ['Channel Distribution'],
    datasets: [
      {
        label: 'With Emails',
        data: [stats.channelsWithEmails || 0],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1
      },
      {
        label: '50k+ Subs',
        data: [stats.channelsWithHighSubs || 0],
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1
      },
      {
        label: 'Both',
        data: [stats.channelsWithBoth || 0],
        backgroundColor: 'rgba(139, 92, 246, 0.8)',
        borderColor: 'rgb(139, 92, 246)',
        borderWidth: 1
      },
      {
        label: 'Has Website',
        data: [stats.channelsWithWebsite || 0],
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderColor: 'rgb(245, 158, 11)',
        borderWidth: 1
      },
      {
        label: 'Has Social',
        data: [stats.channelsWithSocial || 0],
        backgroundColor: 'rgba(236, 72, 153, 0.8)',
        borderColor: 'rgb(236, 72, 153)',
        borderWidth: 1
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            let value = context.raw || 0;
            return `${label}: ${value.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: {
          display: false
        }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          callback: function(value) {
            return value.toLocaleString();
          }
        }
      }
    }
  };

  const hasData = Object.values(stats).some(value => value > 0);
  
  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  return <Bar data={data} options={options} />;
};

export default ChannelChart;