import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

export class KeywordService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 7 * 24 * 60 * 60 * 1000; // 1 week
  }

  async expandKeywords(baseKeyword, country) {
    const cacheKey = `${baseKeyword}-${country}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        logger.debug('Using cached keywords for:', baseKeyword);
        return cached.keywords;
      }
    }

    let keywords = new Set([baseKeyword]);

    try {
      // Method 1: YouTube Autocomplete
      const youtubeSuggestions = await this.getYouTubeAutocomplete(baseKeyword);
      youtubeSuggestions.forEach(k => keywords.add(k));

      // Method 2: Google Autocomplete
      const googleSuggestions = await this.getGoogleAutocomplete(baseKeyword);
      googleSuggestions.forEach(k => keywords.add(k));

      // Method 3: AI Expansion (if enabled)
      if (config.keywordExpansion.useAI) {
        const aiKeywords = await this.getAIKeywords(baseKeyword);
        aiKeywords.forEach(k => keywords.add(k));
      }

      // Method 4: Related Searches
      const relatedKeywords = await this.getRelatedKeywords(baseKeyword);
      relatedKeywords.forEach(k => keywords.add(k));

    } catch (error) {
      logger.error('Keyword expansion error:', error);
    }

    // Apply filters and variations
    keywords = this.applyKeywordFilters(keywords);
    
    // Add city expansions
    const cityExpanded = await this.expandWithCities(keywords, country);
    
    // Limit to max keywords
    const finalKeywords = Array.from(cityExpanded).slice(0, config.keywordExpansion.maxKeywords);
    
    // Cache results
    this.cache.set(cacheKey, {
      keywords: finalKeywords,
      timestamp: Date.now()
    });

    logger.info(`Expanded ${baseKeyword} to ${finalKeywords.length} keywords`);
    return finalKeywords;
  }

  async getYouTubeAutocomplete(keyword) {
    try {
      const response = await axios.get(
        `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`
      );
      
      if (response.data && response.data[1]) {
        return response.data[1];
      }
    } catch (error) {
      logger.debug('YouTube autocomplete failed:', error.message);
    }
    return [];
  }

  async getGoogleAutocomplete(keyword) {
    try {
      const response = await axios.get(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}`
      );
      
      if (response.data && response.data[1]) {
        return response.data[1];
      }
    } catch (error) {
      logger.debug('Google autocomplete failed:', error.message);
    }
    return [];
  }

  async getAIKeywords(keyword) {
    // Use AI service for keyword expansion
    // This could be OpenAI, local model, or custom algorithm
    const variations = [
      `best ${keyword}`,
      `${keyword} expert`,
      `top ${keyword}`,
      `${keyword} professional`,
      `${keyword} specialist`,
      `certified ${keyword}`,
      `professional ${keyword}`,
      `${keyword} services`,
      `${keyword} consultant`,
      `online ${keyword}`
    ];
    
    return variations;
  }

  async getRelatedKeywords(keyword) {
    try {
      // Use Google related searches
      const response = await axios.get(
        `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
      );
      
      const relatedMatches = response.data.match(/\/search\?q=([^"&]+)/g) || [];
      const related = relatedMatches
        .map(m => decodeURIComponent(m.replace('/search?q=', '')))
        .filter(k => k !== keyword)
        .slice(0, 5);
      
      return related;
    } catch (error) {
      logger.debug('Related keywords failed:', error.message);
    }
    return [];
  }

  applyKeywordFilters(keywords) {
    const filtered = new Set();
    const stopWords = ['porn', 'sex', 'adult', 'xxx'];
    
    for (const kw of keywords) {
      // Remove stop words
      if (stopWords.some(sw => kw.includes(sw))) continue;
      
      // Clean keyword
      const clean = kw
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '');
      
      if (clean.length > 3) {
        filtered.add(clean);
      }
    }
    
    return filtered;
  }

  async expandWithCities(keywords, country) {
    const expanded = new Set(keywords);
    const cities = config.keywordExpansion.cities;
    
    for (const keyword of keywords) {
      for (const city of cities) {
        expanded.add(`${keyword} ${city}`);
        expanded.add(`${keyword} in ${city}`);
        if (country) {
          expanded.add(`${keyword} ${city} ${country}`);
        }
      }
    }
    
    return expanded;
  }
}

export const keywordService = new KeywordService();