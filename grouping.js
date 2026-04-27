// grouping.js — Platform + service-type detection from live API data.
// No hardcoded service IDs. Pure functions, fully testable.

// ─── Constants ────────────────────────────────────────────────────────────────

const USD_TO_NAIRA = 1500;

/** Platforms in display order. Each entry defines detection keywords. */
const PLATFORMS = [
  { key: "instagram",  label: "📸 Instagram",  keywords: ["instagram", "ig "] },
  { key: "tiktok",     label: "🎵 TikTok",     keywords: ["tiktok", "tik tok"] },
  { key: "youtube",    label: "▶️ YouTube",    keywords: ["youtube", "yt "] },
  { key: "facebook",   label: "👤 Facebook",   keywords: ["facebook", "fb "] },
  { key: "twitter",    label: "🐦 Twitter/X",  keywords: ["twitter", "x "] },
  { key: "telegram",   label: "✈️ Telegram",   keywords: ["telegram"] },
  { key: "spotify",    label: "🎵 Spotify",    keywords: ["spotify"] },
  { key: "threads",    label: "🧵 Threads",    keywords: ["threads"] },
  { key: "snapchat",   label: "👻 Snapchat",   keywords: ["snapchat"] },
  { key: "linkedin",   label: "💼 LinkedIn",   keywords: ["linkedin"] },
];

/** Service types in display order. */
const SERVICE_TYPES = [
  { key: "followers",    label: "👥 Followers",    keywords: ["follower"] },
  { key: "subscribers",  label: "🔔 Subscribers",  keywords: ["subscriber"] },
  { key: "likes",        label: "❤️ Likes",        keywords: ["like"] },
  { key: "views",        label: "👁️ Views",        keywords: ["view", "watch time", "impression"] },
  { key: "comments",     label: "💬 Comments",     keywords: ["comment"] },
  { key: "shares",       label: "🔄 Shares",       keywords: ["share", "retweet", "repost"] },
  { key: "saves",        label: "🔖 Saves",        keywords: ["save"] },
  { key: "story",        label: "📖 Story Views",  keywords: ["story"] },
  { key: "live",         label: "📡 Live",         keywords: ["live"] },
  { key: "other",        label: "⭐ Other",        keywords: [] }, // catch-all
];

// ─── Detection helpers ────────────────────────────────────────────────────────

/**
 * Detect which platform a service belongs to.
 * Checks both service.category and service.name.
 * @param {{ category: string, name: string }} svc
 * @returns {string} platform key (falls back to "other")
 */
function detectPlatform(svc) {
  const haystack = `${svc.category} ${svc.name}`.toLowerCase();
  for (const p of PLATFORMS) {
    if (p.keywords.some((kw) => haystack.includes(kw))) return p.key;
  }
  return "other";
}

/**
 * Detect which service type a service belongs to.
 * @param {{ name: string }} svc
 * @returns {string} service type key (falls back to "other")
 */
function detectType(svc) {
  const haystack = svc.name.toLowerCase();
  for (const t of SERVICE_TYPES) {
    if (t.keywords.some((kw) => haystack.includes(kw))) return t.key;
  }
  return "other";
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Group a flat service array into a nested structure:
 *   grouped[platformKey][typeKey] = [svc, svc, ...]
 * Only includes platform/type combos that have at least 1 service.
 *
 * @param {object[]} services - raw API array
 * @returns {object} nested map
 */
function groupServices(services) {
  const grouped = {};
  for (const svc of services) {
    const p = detectPlatform(svc);
    const t = detectType(svc);
    if (!grouped[p])    grouped[p] = {};
    if (!grouped[p][t]) grouped[p][t] = [];
    grouped[p][t].push(svc);
  }
  return grouped;
}

/**
 * Return the ordered list of platform keys that have at least 1 service.
 * Main platforms first (in PLATFORMS order), then "other" last.
 * @param {object} grouped
 * @returns {string[]}
 */
function availablePlatforms(grouped) {
  const order = [...PLATFORMS.map((p) => p.key), "other"];
  return order.filter((k) => grouped[k] && Object.keys(grouped[k]).length > 0);
}

/**
 * Return the ordered list of service type keys for a platform.
 * @param {object} grouped
 * @param {string} platformKey
 * @returns {string[]}
 */
function availableTypes(grouped, platformKey) {
  const platform = grouped[platformKey] || {};
  const order    = [...SERVICE_TYPES.map((t) => t.key), "other"];
  return order.filter((k) => platform[k] && platform[k].length > 0);
}

// ─── Label lookups ────────────────────────────────────────────────────────────

function platformLabel(key) {
  return PLATFORMS.find((p) => p.key === key)?.label ?? `🌐 ${capitalize(key)}`;
}

function typeLabel(key) {
  return SERVICE_TYPES.find((t) => t.key === key)?.label ?? `⭐ ${capitalize(key)}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

/**
 * Convert USD rate to NGN cost for a given quantity.
 * @param {number|string} rateUSD - price per 1000 units in USD
 * @param {number}        quantity
 * @returns {number} cost in NGN
 */
function costNGN(rateUSD, quantity) {
  return parseFloat(((quantity / 1000) * parseFloat(rateUSD) * USD_TO_NAIRA).toFixed(2));
}

/**
 * Format NGN rate per 1000 for display.
 * @param {number|string} rateUSD
 * @returns {string}  e.g. "₦450 per 1,000 (~$0.30)"
 */
function formatRate(rateUSD) {
  const naira = parseFloat(rateUSD) * USD_TO_NAIRA;
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 0 })} per 1,000 (~$${parseFloat(rateUSD).toFixed(2)})`;
}

/**
 * Format a Naira amount for display.
 * @param {number} amount
 * @returns {string}  e.g. "₦4,500.00"
 */
function formatNGN(amount) {
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = {
  USD_TO_NAIRA,
  PLATFORMS,
  SERVICE_TYPES,
  groupServices,
  availablePlatforms,
  availableTypes,
  platformLabel,
  typeLabel,
  costNGN,
  formatRate,
  formatNGN,
};
