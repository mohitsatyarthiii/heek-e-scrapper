// src/components/charts/QueueChart.jsx
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
import { Pie } from 'react-chartjs-2';

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

export const QueueChart = ({ queueStats }) => {
  const data = {
    labels: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
    datasets: [
      {
        data: [
          queueStats.pending || 0,
          queueStats.processing || 0,
          queueStats.completed || 0,
          queueStats.failed || 0,
          queueStats.cancelled || 0
        ],
        backgroundColor: [
          'rgba(245, 158, 11, 0.8)',  // Yellow - Pending
          'rgba(59, 130, 246, 0.8)',  // Blue - Processing
          'rgba(16, 185, 129, 0.8)',  // Green - Completed
          'rgba(239, 68, 68, 0.8)',   // Red - Failed
          'rgba(107, 114, 128, 0.8)'  // Gray - Cancelled
        ],
        borderColor: [
          'rgb(245, 158, 11)',
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(239, 68, 68)',
          'rgb(107, 114, 128)'
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
            size: 11,
            weight: '500'
          },
          generateLabels: function(chart) {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label, i) => {
                const value = data.datasets[0].data[i] || 0;
                const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                
                return {
                  text: `${label}: ${value} (${percentage}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  hidden: false,
                  index: i,
                  strokeStyle: data.datasets[0].borderColor[i],
                  lineWidth: 1
                };
              });
            }
            return [];
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
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  // Check if there's any data
  const hasData = Object.values(queueStats).some(value => value > 0);
  
  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">No queue data available</p>
      </div>
    );
  }

  return <Pie data={data} options={options} />;
};

// Optional: Bar Chart Version for Queue
export const QueueBarChart = ({ queueStats }) => {
  const data = {
    labels: ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled'],
    datasets: [
      {
        label: 'Tasks',
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
        borderColor: [
          'rgb(245, 158, 11)',
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(239, 68, 68)',
          'rgb(107, 114, 128)'
        ],
        borderWidth: 1,
        borderRadius: 8
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
        cornerRadius: 8
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          stepSize: 1,
          callback: function(value) {
            if (Number.isInteger(value)) {
              return value;
            }
          }
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  const hasData = Object.values(queueStats).some(value => value > 0);
  
  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">No queue data available</p>
      </div>
    );
  }

  return <Bar data={data} options={options} />;
};

export default QueueChart;