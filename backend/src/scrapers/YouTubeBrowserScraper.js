import { extractEmail } from "../utils/email.js";
import { parseCount, randomDelay } from "../utils/parse.js";

export class YouTubeBrowserScraper {

  constructor() {
    this.browser = null;
    this.ownsBrowser = false;
  }

  async init(browser) {
    this.browser = browser;
  }

  async scrape(keyword, options = {}) {

    const {
      minSubs = 0,
      targetCount = 100,
      proxy = null,
      shouldStop = null,
      onProgress = null
    } = options;

    const context = await this.browser.newContext({
      proxy: proxy || undefined,
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    });

    const page = await context.newPage();

    const results = [];
    const channelUrls = new Set();

    try {

      const searchUrl =
        `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;

      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

      await page.waitForTimeout(2000);

      let scrolls = 0;

      while (channelUrls.size < targetCount * 3 && scrolls < 30) {

        if (shouldStop && await shouldStop()) break;

        const urls = await page.$$eval(
          'a[href*="/@"],a[href*="/channel/"]',
          links =>
            links
              .map(a => a.href)
              .filter(h => h.includes("youtube.com"))
        );

        urls.forEach(u => channelUrls.add(u));

        await page.evaluate(() => window.scrollBy(0, 800));

        await page.waitForTimeout(1000 + Math.random() * 1000);

        scrolls++;
      }

      for (const url of channelUrls) {

        if (results.length >= targetCount) break;

        if (shouldStop && await shouldStop()) break;

        try {

          const aboutUrl = url.replace(/\/$/, "") + "/about";

          await page.goto(aboutUrl, { waitUntil: "domcontentloaded" });

          await randomDelay(2000, 4000);

          const data = await page.evaluate(() => {

            const title =
              document.querySelector("ytd-channel-name #text")?.textContent?.trim() ||
              "";

            const subsText =
              document.querySelector("#subscriber-count")?.textContent ||
              "";

            const description =
              document.body?.innerText || "";

            const canonical =
              document.querySelector("link[rel=canonical]")?.href ||
              window.location.href;

            return {
              title,
              subsText,
              description,
              canonical
            };

          });

          const subs = parseCount(data.subsText);

          if (subs < minSubs) continue;

          const email = extractEmail(data.description);

          if (!email) continue;

          const idMatch = data.canonical.match(/channel\/(UC[a-zA-Z0-9_-]+)/);

          const channelId =
            idMatch ? idMatch[1] : data.canonical;

          results.push({
            channelId,
            keyword,
            title: data.title,
            subscribers: subs,
            email,
            platform: "youtube",
            source: "youtube-browser",
            profileUrl: url
          });

          if (onProgress) onProgress(results.length);

        } catch {}

        await randomDelay(2000, 5000);

      }

    } finally {

      await context.close();

    }

    return results;

  }

}