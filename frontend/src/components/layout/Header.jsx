// src/components/layout/Header.jsx
import React from 'react';
import { Bars3Icon, XMarkIcon, WifiIcon, ServerStackIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useState } from 'react';
import { useEffect } from 'react';
import { CheckCircleIcon } from 'lucide-react';

export const Header = ({ sidebarOpen, setSidebarOpen, isConnected, workerStatus }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-20">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {sidebarOpen ? (
                <XMarkIcon className="h-6 w-6 text-gray-600" />
              ) : (
                <Bars3Icon className="h-6 w-6 text-gray-600" />
              )}
            </button>
            
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">YouTube Scraper Pro</h1>
                <p className="text-xs text-gray-500">AI-Powered Channel Discovery</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {/* Worker Status */}
            <div className="flex items-center space-x-3 px-4 py-2 bg-gray-100 rounded-lg">
              <ServerStackIcon className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500">Worker Status</p>
                <div className="flex items-center space-x-2">
                  <span className={`flex items-center space-x-1 ${
                    workerStatus.isProcessing ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {workerStatus.isProcessing ? (
                      <>
                        <ArrowPathIcon className="h-3 w-3 animate-spin" />
                        <span className="text-sm font-medium">Processing</span>
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="h-3 w-3" />
                        <span className="text-sm font-medium">Idle</span>
                      </>
                    )}
                  </span>
                  <span className="text-sm text-gray-600">
                    {workerStatus.tasksProcessed} tasks
                  </span>
                </div>
              </div>
            </div>

            {/* Connection Status */}
            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
              isConnected ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <WifiIcon className={`h-5 w-5 ${isConnected ? 'text-green-600' : 'text-red-600'}`} />
              <span className={`text-sm font-medium ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>

            {/* Time */}
            <div className="text-sm text-gray-500">
              {format(currentTime, 'HH:mm:ss')}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};