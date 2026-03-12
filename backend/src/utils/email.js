/**
 * Email regex (safe version)
 */
export const EMAIL_REGEX =
  /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

/**
 * Domains to ignore
 */
const IGNORE_DOMAINS = [
  "youtube.com",
  "google.com",
  "googleapis.com",
  "gstatic.com",
  "ytimg.com",
  "ggpht.com",
  "example.com",
  "sentry.io",
  "w3.org",
  "schema.org",
  "wix.com",
  "squarespace.com",
];

/**
 * Normalize email
 */
export function normalizeEmail(email) {
  if (!email) return null;

  return email
    .trim()
    .replace(/[<>]/g, "")
    .toLowerCase();
}

/**
 * Check if email domain should be ignored
 */
function isIgnoredDomain(domain) {
  return IGNORE_DOMAINS.some((d) => domain.endsWith(d));
}

/**
 * Extract first valid email
 */
export function extractEmail(text) {
  if (!text) return null;

  const matches = text.match(EMAIL_REGEX);

  if (!matches) return null;

  for (const raw of matches) {
    const email = normalizeEmail(raw);

    const domain = email.split("@")[1];

    if (!domain) continue;

    if (isIgnoredDomain(domain)) continue;

    return email;
  }

  return null;
}

/**
 * Extract all valid emails
 */
export function extractAllEmails(text) {
  if (!text) return [];

  const matches = text.match(EMAIL_REGEX);

  if (!matches) return [];

  const emails = [];

  for (const raw of matches) {
    const email = normalizeEmail(raw);

    const domain = email.split("@")[1];

    if (!domain) continue;

    if (isIgnoredDomain(domain)) continue;

    emails.push(email);
  }

  return [...new Set(emails)];
}