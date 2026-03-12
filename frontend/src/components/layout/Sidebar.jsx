// src/components/layout/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  UserGroupIcon,
  QueueListIcon,
  DocumentTextIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Channels', href: '/channels', icon: UserGroupIcon },
  { name: 'Queue', href: '/queue', icon: QueueListIcon },
  { name: 'Logs', href: '/logs', icon: DocumentTextIcon },
];

export const Sidebar = ({ sidebarOpen, currentPath }) => {
  return (
    <aside className={`fixed left-0 top-[73px] h-[calc(100vh-73px)] bg-white border-r border-gray-200 transition-all duration-300 z-10 ${
      sidebarOpen ? 'w-64' : 'w-20'
    }`}>
      <nav className="h-full flex flex-col py-6">
        <div className="flex-1 space-y-1 px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) => `
                flex items-center px-3 py-3 rounded-lg transition-all duration-200 group
                ${isActive 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              <item.icon className={`h-6 w-6 flex-shrink-0 ${
                sidebarOpen ? 'mr-3' : 'mx-auto'
              }`} />
              {sidebarOpen && (
                <span className="text-sm font-medium">{item.name}</span>
              )}
              {!sidebarOpen && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {item.name}
                </div>
              )}
            </NavLink>
          ))}
        </div>

        {/* Bottom Section */}
        <div className="px-3 mt-auto">
          <div className={`border-t border-gray-200 pt-4 ${sidebarOpen ? 'px-3' : 'px-1'}`}>
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                <span className="text-white text-sm font-bold">YS</span>
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    YouTube Scraper
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    v2.0.0
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
};