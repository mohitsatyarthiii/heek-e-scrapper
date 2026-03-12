import fs from "fs";
import path from "path";
import { extractEmail } from "../utils/email.js";
import { parseCount, randomDelay } from "../utils/parse.js";

const SESSION_PATH = path.resolve("src/sessions/x-session.json");

export class XScraper {

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

    if (!cookies) throw new Error("X session missing");

    const context = await this.browser.newContext({
      proxy: proxy || undefined
    });

    await context.addCookies(cookies);

    const page = await context.newPage();

    const results = [];
    const profileUrls = new Set();

    try {

      await page.goto(
        `https://x.com/search?q=${encodeURIComponent(keyword)}&f=user`
      );

      await randomDelay(3000, 5000);

      const urls = await page.$$eval(
        "a[href^='/']",
        links => links.map(l => "https://x.com" + l.getAttribute("href"))
      );

      urls.forEach(u => {
        if (/x\.com\/[A-Za-z0-9_]+$/.test(u))
          profileUrls.add(u);
      });

      for (const url of profileUrls) {

        if (results.length >= targetCount) break;

        try {

          await page.goto(url);

          await randomDelay(3000, 5000);

          const data = await page.evaluate(() => {

            const name =
              document.querySelector("h2")?.textContent || "";

            const bio =
              document.querySelector("[data-testid='UserDescription']")?.textContent || "";

            const followers =
              document.body.innerText.match(/([\d,.]+)\sFollowers/i)?.[1] || "";

            return {
              name,
              bio,
              followers
            };

          });

          const subs = parseCount(data.followers);

          if (subs < minSubs) continue;

          const email = extractEmail(data.bio);

          if (!email) continue;

          const username = url.split("x.com/")[1];

          results.push({
            channelId: username,
            keyword,
            title: data.name,
            subscribers: subs,
            email,
            platform: "x",
            source: "x",
            profileUrl: url
          });

          if (onProgress) onProgress(results.length);

        } catch {}

        await randomDelay(6000, 10000);
      }

    } finally {
      await context.close();
    }

    return results;
  }

}