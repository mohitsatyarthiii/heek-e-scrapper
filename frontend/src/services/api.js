// src/services/api.js
const API_URL = 'https://heek-e-scrapper.onrender.com/api';

class ApiService {
  async request(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'API request failed');
    }

    return response.json();
  }

  // Channels
  async getChannels(filters) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) params.append(key, filters[key]);
    });
    return this.request(`/channels?${params}`);
  }

  async getChannel(id) {
    return this.request(`/channels/${id}`);
  }

  async exportChannels() {
    const response = await fetch(`${API_URL}/export/channels`);
    return response.blob();
  }

  // Queue
  async getQueue(page = 1) {
    return this.request(`/queue?page=${page}`);
  }

  async cancelTask(taskId) {
    return this.request(`/task/${taskId}`, { method: 'DELETE' });
  }

  // Stats
  async getStats() {
    return this.request('/stats');
  }

  // Scrape
  async startScrape(data) {
    return this.request('/scrape', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Logs
  async getLogs(filters) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        if (filters[key] instanceof Date) {
          params.append(key, filters[key].toISOString());
        } else {
          params.append(key, filters[key]);
        }
      }
    });
    return this.request(`/logs?${params}`);
  }

  async clearLogs() {
    return this.request('/logs', { method: 'DELETE' });
  }

  // Countries
  async getCountries() {
    return this.request('/countries');
  }

  // Health
  async healthCheck() {
    return this.request('/health');
  }
}

export const api = new ApiService();