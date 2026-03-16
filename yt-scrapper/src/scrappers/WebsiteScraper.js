import { browserPool } from '../lib/BrowserPool.js';
import { emailExtractor } from '../utils/email.js';
import { logger } from '../utils/logger.js';
import { parser } from '../utils/parse.js';

export class WebsiteScraper {
  constructor() {
    this.visitedUrls = new Set();
    this.maxPagesPerSite = 10;
    this.scrapeDelay = 1000;
  }

  async scrapeWebsite(url, options = {}) {
    const {
      maxDepth = 2,
      followLinks = true,
      extractEmails = true,
      extractSocial = true
    } = options;

    if (this.visitedUrls.has(url)) {
      return null;
    }

    this.visitedUrls.add(url);

    let pageData = null;
    const result = {
      url,
      title: '',
      description: '',
      emails: [],
      socialLinks: [],
      internalLinks: [],
      externalLinks: [],
      text: '',
      html: '',
      timestamp: new Date().toISOString()
    };

    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;

      // Navigate to website
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000
      }).catch(() => {});

      // Extract basic info
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || '',
          keywords: document.querySelector('meta[name="keywords"]')?.content || '',
          h1: document.querySelector('h1')?.innerText || '',
          text: document.body.innerText,
          html: document.documentElement.outerHTML
        };
      });

      Object.assign(result, pageInfo);

      // Extract emails
      if (extractEmails) {
        const emails = emailExtractor.extractFromText(pageInfo.text);
        result.emails = emails;
      }

      // Extract links
      const links = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a[href]').forEach(a => {
          links.push({
            text: a.innerText.trim(),
            href: a.href,
            rel: a.rel
          });
        });
        return links;
      });

      // Categorize links
      const baseDomain = new URL(url).hostname;
      
      for (const link of links) {
        try {
          const linkUrl = new URL(link.href);
          
          if (linkUrl.hostname === baseDomain) {
            result.internalLinks.push(link.href);
          } else {
            result.externalLinks.push(link.href);
            
            // Check if it's a social link
            if (this.isSocialLink(link.href)) {
              result.socialLinks.push({
                platform: this.getSocialPlatform(link.href),
                url: link.href,
                text: link.text
              });
            }
          }
        } catch {
          // Invalid URL, skip
        }
      }

      // Follow internal links if depth > 0
      if (followLinks && maxDepth > 1) {
        const uniqueInternal = [...new Set(result.internalLinks)].slice(0, this.maxPagesPerSite);
        
        for (const internalUrl of uniqueInternal) {
          // Don't revisit
          if (this.visitedUrls.has(internalUrl)) continue;
          
          // Add delay
          await this.delay(this.scrapeDelay);
          
          // Recursively scrape
          const subPage = await this.scrapeWebsite(internalUrl, {
            ...options,
            maxDepth: maxDepth - 1
          });
          
          if (subPage) {
            // Merge emails
            result.emails.push(...subPage.emails);
            
            // Merge social links
            result.socialLinks.push(...subPage.socialLinks);
          }
        }
      }

      // Deduplicate
      result.emails = [...new Set(result.emails)];
      result.socialLinks = [...new Map(
        result.socialLinks.map(item => [item.url, item])
      ).values()];

    } catch (error) {
      logger.debug(`Failed to scrape website ${url}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }

    return result;
  }

  async scrapeContactPage(baseUrl) {
    const contactVariations = [
      '/contact',
      '/contact-us',
      '/about',
      '/about-us',
      '/support',
      '/help',
      '/imprint',
      '/impressum'
    ];

    const parsed = new URL(baseUrl);
    
    for (const variation of contactVariations) {
      const contactUrl = `${parsed.protocol}//${parsed.hostname}${variation}`;
      
      try {
        const result = await this.scrapeWebsite(contactUrl, {
          maxDepth: 1,
          followLinks: false
        });
        
        if (result && result.emails.length > 0) {
          return result;
        }
      } catch (error) {
        // Skip failed contact pages
      }
    }

    return null;
  }

  async scrapeLinktree(url) {
    const result = {
      url,
      links: [],
      socialLinks: [],
      emails: [],
      bio: ''
    };

    let pageData = null;

    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000
      });

      // Extract bio/description
      result.bio = await page.evaluate(() => {
        const bioEl = document.querySelector('.description, .bio, meta[name="description"]');
        return bioEl?.content || bioEl?.innerText || '';
      });

      // Extract all links
      const links = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('a').forEach(link => {
          if (link.href && !link.href.includes(window.location.host)) {
            items.push({
              url: link.href,
              text: link.innerText.trim(),
              isSocial: link.href.match(/(instagram|twitter|facebook|linkedin|tiktok)/i) !== null
            });
          }
        });
        return items;
      });

      for (const link of links) {
        result.links.push(link.url);
        
        if (link.isSocial) {
          result.socialLinks.push(link);
        }
      }

      // Extract emails from page
      const pageText = await page.evaluate(() => document.body.innerText);
      result.emails = emailExtractor.extractFromText(pageText);

    } catch (error) {
      logger.debug(`Failed to scrape Linktree ${url}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }

    return result;
  }

  isSocialLink(url) {
    const socialDomains = [
      'instagram.com',
      'twitter.com',
      'facebook.com',
      'linkedin.com',
      'tiktok.com',
      'snapchat.com',
      'discord.com',
      'twitch.tv',
      'pinterest.com',
      'reddit.com',
      'youtube.com',
      't.me',
      'wa.me'
    ];
    
    return socialDomains.some(domain => url.includes(domain));
  }

  getSocialPlatform(url) {
    if (url.includes('instagram')) return 'instagram';
    if (url.includes('twitter') || url.includes('x.com')) return 'twitter';
    if (url.includes('facebook')) return 'facebook';
    if (url.includes('linkedin')) return 'linkedin';
    if (url.includes('tiktok')) return 'tiktok';
    if (url.includes('snapchat')) return 'snapchat';
    if (url.includes('discord')) return 'discord';
    if (url.includes('twitch')) return 'twitch';
    if (url.includes('pinterest')) return 'pinterest';
    if (url.includes('reddit')) return 'reddit';
    if (url.includes('youtube')) return 'youtube';
    if (url.includes('t.me')) return 'telegram';
    if (url.includes('wa.me')) return 'whatsapp';
    return 'other';
  }

  async extractBusinessInfo(url) {
    const result = {
      name: null,
      email: null,
      phone: null,
      address: null,
      social: []
    };

    let pageData = null;

    try {
      pageData = await browserPool.getPage();
      const { page } = pageData;

      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

      // Try structured data
      const structuredData = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const data = [];
        
        scripts.forEach(script => {
          try {
            data.push(JSON.parse(script.innerText));
          } catch {}
        });
        
        return data;
      });

      // Extract from structured data
      for (const data of structuredData) {
        if (data.name) result.name = data.name;
        if (data.email) result.email = data.email;
        if (data.telephone) result.phone = data.telephone;
        if (data.address) result.address = typeof data.address === 'string' ? data.address : data.address.streetAddress;
        
        if (data.sameAs) {
          result.social.push(...data.sameAs);
        }
      }

      // If no structured data, scrape from page
      if (!result.email) {
        const text = await page.evaluate(() => document.body.innerText);
        const emails = emailExtractor.extractFromText(text);
        if (emails.length > 0) result.email = emails[0];
      }

      if (!result.phone) {
        const text = await page.evaluate(() => document.body.innerText);
        const phoneMatch = text.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/);
        if (phoneMatch) result.phone = phoneMatch[0];
      }

    } catch (error) {
      logger.debug(`Failed to extract business info from ${url}:`, error.message);
    } finally {
      if (pageData) {
        await browserPool.releasePage(pageData);
      }
    }

    return result;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const websiteScraper = new WebsiteScraper();