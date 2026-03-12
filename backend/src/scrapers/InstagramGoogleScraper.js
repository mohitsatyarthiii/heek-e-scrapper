import { extractEmail } from "../utils/email.js";
import { parseCount, randomDelay } from "../utils/parse.js";

export class InstagramGoogleScraper {

  constructor() {
    this.browser = null;
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
      locale: "en-US"
    });

    const page = await context.newPage();

    const results = [];
    const profileUrls = new Set();

    const queries = [
      `site:instagram.com "@gmail.com" ${keyword}`,
      `site:instagram.com "business email" ${keyword}`,
      `site:instagram.com "contact" ${keyword}`,
      `site:instagram.com ${keyword} email`
    ];

    try {

      for (const query of queries) {

        await page.goto(
          `https://www.google.com/search?q=${encodeURIComponent(query)}&num=50`,
          { waitUntil: "domcontentloaded" }
        );

        await randomDelay(2000, 4000);

        const urls = await page.$$eval(
          "a[href*='instagram.com']",
          links =>
            links
              .map(l => l.href)
              .filter(h => h.includes("instagram.com"))
        );

        urls.forEach(u => profileUrls.add(u));

        await randomDelay(4000, 6000);
      }

      for (const url of profileUrls) {

        if (results.length >= targetCount) break;

        if (shouldStop && await shouldStop()) break;

        try {

          await page.goto(url, { waitUntil: "domcontentloaded" });

          await randomDelay(2000, 4000);

          const profile = await page.evaluate(() => {

            const meta =
              document.querySelector("meta[name=description]")?.content || "";

            const name =
              document.querySelector("title")?.textContent || "";

            const followersMatch =
              meta.match(/([\d,.]+[KMB]?)\sFollowers/i);

            const followers =
              followersMatch ? followersMatch[1] : "";

            const bodyText =
              document.body?.innerText || "";

            return {
              name,
              followers,
              bio: meta + " " + bodyText
            };

          });

          const subs = parseCount(profile.followers);

          if (subs < minSubs) continue;

          const email = extractEmail(profile.bio);

          if (!email) continue;

          const usernameMatch = url.match(/instagram\.com\/([^\/]+)/);

          const username = usernameMatch ? usernameMatch[1] : url;

          results.push({
            channelId: username,
            keyword,
            title: profile.name,
            subscribers: subs,
            email,
            platform: "instagram",
            source: "instagram-google",
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