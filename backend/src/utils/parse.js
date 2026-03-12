/**
 * Convert follower/subscriber text to number
 * Examples:
 * 1.2K -> 1200
 * 5M -> 5000000
 * 900 -> 900
 */
export function parseCount(text) {
  if (!text) return 0;

  const clean = text
    .toLowerCase()
    .replace(/followers?|subscribers?/g, "")
    .trim();

  const match = clean.match(/([\d,.]+)\s*(k|m|b)?/i);

  if (!match) return 0;

  const num = parseFloat(match[1].replace(/,/g, ""));

  const suffix = (match[2] || "").toLowerCase();

  if (suffix === "b") return Math.round(num * 1_000_000_000);

  if (suffix === "m") return Math.round(num * 1_000_000);

  if (suffix === "k") return Math.round(num * 1_000);

  return Math.round(num);
}

/**
 * Safe integer parser
 */
export function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);

  return Number.isNaN(n) ? fallback : n;
}

/**
 * Delay helper
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay for anti-bot
 */
export function randomDelay(min = 2000, max = 5000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;

  return sleep(ms);
}