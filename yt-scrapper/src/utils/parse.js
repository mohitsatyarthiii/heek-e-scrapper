export class Parser {
  static parseSubscriberCount(subscriberString) {
    if (!subscriberString) return 0;
    
    const match = subscriberString.match(/^([\d,.]+)\s*([KMB])?/i);
    if (!match) return 0;
    
    let num = parseFloat(match[1].replace(/,/g, ''));
    const suffix = match[2]?.toUpperCase();
    
    if (suffix === 'K') num *= 1000;
    if (suffix === 'M') num *= 1000000;
    if (suffix === 'B') num *= 1000000000;
    
    return Math.round(num);
  }

  static parseVideoDuration(duration) {
    // Parse ISO 8601 duration
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  static parseDate(dateString) {
    // Parse YouTube date format
    const patterns = [
      // "1 year ago", "2 months ago"
      /(\d+)\s*(year|month|week|day|hour|minute)s?\s*ago/i,
      // "Jan 1, 2020"
      /([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/,
      // "2020-01-01"
      /(\d{4})-(\d{2})-(\d{2})/
    ];

    for (const pattern of patterns) {
      const match = dateString.match(pattern);
      if (match) {
        if (pattern === patterns[0]) {
          // Relative date
          const value = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const now = new Date();
          
          switch(unit) {
            case 'year': now.setFullYear(now.getFullYear() - value); break;
            case 'month': now.setMonth(now.getMonth() - value); break;
            case 'week': now.setDate(now.getDate() - (value * 7)); break;
            case 'day': now.setDate(now.getDate() - value); break;
            case 'hour': now.setHours(now.getHours() - value); break;
            case 'minute': now.setMinutes(now.getMinutes() - value); break;
          }
          
          return now;
        } else if (pattern === patterns[1]) {
          // Month name format
          const months = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
          };
          
          const month = months[match[1].toLowerCase()];
          const day = parseInt(match[2]);
          const year = parseInt(match[3]);
          
          return new Date(year, month, day);
        } else {
          // ISO format
          return new Date(dateString);
        }
      }
    }
    
    return null;
  }

  static extractKeywords(text, maxKeywords = 10) {
    if (!text) return [];
    
    // Remove common words and punctuation
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Count frequency
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Sort by frequency and return top keywords
    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(entry => entry[0]);
  }

  static extractLocation(text) {
    if (!text) return null;
    
    // Common location patterns
    const patterns = [
      /(?:based in|from|located in)\s+([A-Za-z\s,]+)/i,
      /📍\s*([A-Za-z\s,]+)/,
      /🌍\s*([A-Za-z\s,]+)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  static parseUrl(url) {
    try {
      const parsed = new URL(url);
      return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        params: Object.fromEntries(parsed.searchParams)
      };
    } catch {
      return null;
    }
  }

  static cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s@.]/g, '')
      .trim();
  }

  static extractNumbers(text) {
    if (!text) return [];
    
    const matches = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) || [];
    return matches.map(m => parseFloat(m.replace(/,/g, '')));
  }

  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  static truncate(text, length = 100, suffix = '...') {
    if (!text || text.length <= length) return text;
    
    return text.substring(0, length).trim() + suffix;
  }

  static slugify(text) {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export const parser = new Parser();