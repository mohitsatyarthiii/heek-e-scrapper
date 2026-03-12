import fs from "fs";
import path from "path";
import { extractEmail } from "../utils/email.js";
import { parseCount, randomDelay } from "../utils/parse.js";

const SESSION_PATH = path.resolve("src/sessions/instagram-session.json");

export class InstagramScraper {

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
      targetCount = 50,
      proxy = null,
      shouldStop = null,
      onProgress = null
    } = options;

    const cookies = await this.loadSession();

    if (!cookies) throw new Error("Instagram session missing");

    const context = await this.browser.newContext({
      proxy: proxy || undefined
    });

    await context.addCookies(cookies);

    const page = await context.newPage();

    const results = [];
    const profileUrls = new Set();

    try {

      await page.goto("https://www.instagram.com/");

      await randomDelay(3000, 5000);

      await page.goto(
        `https://www.instagram.com/explore/tags/${encodeURIComponent(keyword)}/`
      );

      await randomDelay(3000, 5000);

      const posts = await page.$$eval(
        "a[href*='/p/']",
        links => links.map(l => l.href)
      );

      for (const post of posts) {

        if (profileUrls.size > targetCount * 3) break;

        try {

          await page.goto(post);

          await randomDelay(2000, 4000);

          const profile = await page.$eval(
            "header a",
            el => el.href
          );

          if (profile) profileUrls.add(profile);

        } catch {}

      }

      for (const url of profileUrls) {

        if (results.length >= targetCount) break;

        if (shouldStop && await shouldStop()) break;

        try {

          await page.goto(url);

          await randomDelay(2000, 4000);

          const data = await page.evaluate(() => {

            const name =
              document.querySelector("header h2")?.textContent || "";

            const bio =
              document.querySelector("header section span")?.textContent || "";

            const followersText =
              document.body.innerText.match(/([\d,.]+[KMB]?)\sfollowers/i)?.[1] || "";

            return {
              name,
              bio,
              followersText
            };

          });

          const subs = parseCount(data.followersText);

          if (subs < minSubs) continue;

          const email = extractEmail(data.bio);

          if (!email) continue;

          const usernameMatch = url.match(/instagram.com\/([^\/]+)/);

          const username = usernameMatch ? usernameMatch[1] : url;

          results.push({
            channelId: username,
            keyword,
            title: data.name,
            subscribers: subs,
            email,
            platform: "instagram",
            source: "instagram",
            profileUrl: url
          });

          if (onProgress) onProgress(results.length);

        } catch {}

        await randomDelay(3000, 6000);
      }

    } finally {
      await context.close();
    }

    return results;
  }

}