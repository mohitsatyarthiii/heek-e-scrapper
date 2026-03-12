
import { QueueService } from "./QueueService.js";
import Channel from "../models/Channel.js";
import { YouTubeBrowserScraper } from "../scrapers/YouTubeBrowserScraper.js";
import { InstagramScraper } from "../scrapers/InstagramScraper.js";
import { InstagramGoogleScraper } from "../scrapers/InstagramGoogleScraper.js";
import { LinkedInScraper } from "../scrapers/LinkedInScraper.js";
import { XScraper } from "../scrapers/XScraper.js";

export class ScraperService {


  static async process(queueItem, browserPool) {
    const source = queueItem.platform;
    try {
      let channels = [];
      switch (source) {
        case "youtube-browser":
          channels = await this.runYouTubeBrowser(queueItem, browserPool);
          break;
        case "instagram":
          channels = await this.runInstagram(queueItem, browserPool);
          break;
        case "instagram-google":
          channels = await this.runInstagramGoogle(queueItem, browserPool);
          break;
        case "linkedin":
          channels = await this.runLinkedIn(queueItem, browserPool);
          break;
        case "x":
          channels = await this.runX(queueItem, browserPool);
          break;
      }
      // Save channels and log
      let saved = 0;
      for (const ch of channels) {
        try {
          await Channel.updateOne(
            { channelId: ch.channelId, platform: ch.platform },
            { $set: ch },
            { upsert: true }
          );
          console.log(`✅ Channel found: ${ch.title || ch.channelId}`);
          saved++;
        } catch (err) {
          console.error("Error saving channel:", err.message);
        }
        // Update progress
        await QueueService.updateProgress(queueItem._id, saved);
      }
      await QueueService.complete(queueItem._id, saved);
      return saved;
    } catch (err) {
      await QueueService.fail(queueItem._id);
      throw err;
    }
  }


  static async runYouTubeBrowser(queueItem, browserPool) {
    const entry = await browserPool.checkout();
    try {
      const scraper = new YouTubeBrowserScraper();
      await scraper.init(entry.browser);
      const results = await scraper.scrape(queueItem.keyword, queueItem);
      return results;
    } finally {
      browserPool.release(entry);
    }
  }

  


  static async runInstagram(queueItem, browserPool) {
    const entry = await browserPool.checkout();
    try {
      const scraper = new InstagramScraper();
      await scraper.init(entry.browser);
      const results = await scraper.scrape(queueItem.keyword, queueItem);
      return results;
    } finally {
      browserPool.release(entry);
    }
  }


  static async runInstagramGoogle(queueItem, browserPool) {
    const entry = await browserPool.checkout();
    try {
      const scraper = new InstagramGoogleScraper();
      await scraper.init(entry.browser);
      const results = await scraper.scrape(queueItem.keyword, queueItem);
      return results;
    } finally {
      browserPool.release(entry);
    }
  }


  static async runLinkedIn(queueItem, browserPool) {
    const entry = await browserPool.checkout();
    try {
      const scraper = new LinkedInScraper();
      await scraper.init(entry.browser);
      const results = await scraper.scrape(queueItem.keyword, queueItem);
      return results;
    } finally {
      browserPool.release(entry);
    }
  }


  static async runX(queueItem, browserPool) {
    const entry = await browserPool.checkout();
    try {
      const scraper = new XScraper();
      await scraper.init(entry.browser);
      const results = await scraper.scrape(queueItem.keyword, queueItem);
      return results;
    } finally {
      browserPool.release(entry);
    }
  }

}