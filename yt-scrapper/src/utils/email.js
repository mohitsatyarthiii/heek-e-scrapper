import validator from 'validator';
import { config } from '../config/config.js';

export class EmailExtractor {
  constructor() {
    this.patterns = config.emailPatterns;
    this.commonDisposables = [
      'tempmail.com', 'throwaway.com', 'mailinator.com',
      'guerrillamail.com', 'sharklasers.com'
    ];
  }

  extractFromText(text) {
    if (!text) return [];
    
    const emails = new Set();
    
    for (const pattern of this.patterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        // Clean up obfuscated emails
        const cleaned = this.cleanEmail(match);
        if (this.isValidEmail(cleaned)) {
          emails.add(cleaned.toLowerCase());
        }
      }
    }
    
    return Array.from(emails);
  }

  cleanEmail(email) {
    return email
      .replace(/\s*[àat]\s*/g, '@')
      .replace(/\s*dot\s*/g, '.')
      .replace(/\[at\]/gi, '@')
      .replace(/\[dot\]/gi, '.')
      .replace(/\s+/g, '')
      .replace(/[<>"']/g, '');
  }

  isValidEmail(email) {
    if (!validator.isEmail(email)) return false;
    
    const domain = email.split('@')[1];
    
    // Check for disposable domains
    if (this.commonDisposables.includes(domain)) return false;
    
    // Check for common false positives
    if (email.includes('example.com') || 
        email.includes('domain.com') ||
        email.includes('your-email')) return false;
    
    return true;
  }

  prioritizeEmails(emails) {
    // Prioritize business/personal emails over no-reply
    const priority = {
      high: [],
      medium: [],
      low: []
    };
    
    for (const email of emails) {
      if (email.includes('contact@') || 
          email.includes('info@') ||
          email.includes('business@') ||
          email.includes('collab@')) {
        priority.high.push(email);
      } else if (email.includes('@gmail.com') || 
                 email.includes('@yahoo.com') ||
                 email.includes('@outlook.com')) {
        priority.medium.push(email);
      } else if (email.includes('no-reply') ||
                 email.includes('noreply') ||
                 email.includes('donotreply')) {
        priority.low.push(email);
      } else {
        priority.medium.push(email);
      }
    }
    
    return [...priority.high, ...priority.medium, ...priority.low];
  }
}

export const emailExtractor = new EmailExtractor();