import fs from "fs";
import path from "path";
import { extractEmail } from "../utils/email.js";
import { parseCount, randomDelay } from "../utils/parse.js";

const SESSION_PATH = path.resolve("src/sessions/linkedin-session.json");

export class LinkedInScraper {

  constructor() {
    this.browser = null;
  }

  async init(browser) {
    this.browser = browser;
  }

  async loadSession() {
    try {
      const data = JSON.parse(fs.readFileSync(SESSION_PATH));
      return data.cookies;
    } catch {
      return null;
    }
  }

  async scrape(keyword, options = {}) {

    const {
      minSubs = 0,
      targetCount = 30,
      proxy = null,
      shouldStop = null,
      onProgress = null
    } = options;

    const cookies = await this.loadSession();

    if (!cookies) throw new Error("LinkedIn session missing");

    const context = await this.browser.newContext({
      proxy: proxy || undefined
    });

    await context.addCookies(cookies);

    const page = await context.newPage();

    const results = [];
    const profileUrls = new Set();

    try {

      await page.goto(
        `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keyword)}`
      );

      await randomDelay(3000, 5000);

      const urls = await page.$$eval(
        "a[href*='/in/']",
        links => links.map(l => l.href)
      );

      urls.forEach(u => profileUrls.add(u));

      for (const url of profileUrls) {

        if (results.length >= targetCount) break;

        try {

          await page.goto(url);

          await randomDelay(3000, 5000);

          const profile = await page.evaluate(() => {

            const name =
              document.querySelector("h1")?.textContent || "";

            const about =
              document.body?.innerText || "";

            const followers =
              document.body.innerText.match(/([\d,.]+)\sfollowers/i)?.[1] || "";

            return {
              name,
              about,
              followers
            };

          });

          const subs = parseCount(profile.followers);

          if (subs < minSubs) continue;

          const email = extractEmail(profile.about);

          if (!email) continue;

          const slug = url.split("/in/")[1]?.split("/")[0];

          results.push({
            channelId: slug,
            keyword,
            title: profile.name,
            subscribers: subs,
            email,
            platform: "linkedin",
            source: "linkedin",
            profileUrl: url
          });

          if (onProgress) onProgress(results.length);

        } catch {}

        await randomDelay(5000, 8000);
      }

    } finally {
      await context.close();
    }

    return results;
  }

}