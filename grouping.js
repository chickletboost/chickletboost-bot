"use strict";

// ─── Exchange rate ─────────────────────────────────────────────────────────────
// PerfectPanel returns rate in USD per 1,000 units.
// Update this value to match the current market rate before going live.
const USD_TO_NAIRA = 1500;

// ─── Platform definitions (detection order matters) ───────────────────────────
const PLATFORMS = [
  { key: "instagram",  label: "📸 Instagram",       keywords: ["instagram", "ig "] },
  { key: "tiktok",     label: "🎵 TikTok",          keywords: ["tiktok", "tik tok"] },
  { key: "youtube",    label: "▶️  YouTube",        keywords: ["youtube", "yt "] },
  { key: "facebook",   label: "👤 Facebook",        keywords: ["facebook", "fb "] },
  { key: "twitter",    label: "🐦 Twitter/X",       keywords: ["twitter", "twit", " x "] },
  { key: "telegram",   label: "✈️  Telegram",       keywords: ["telegram"] },
  { key: "spotify",    label: "🎵 Spotify",         keywords: ["spotify"] },
  { key: "threads",    label: "🧵 Threads",         keywords: ["threads"] },
  { key: "snapchat",   label: "👻 Snapchat",        keywords: ["snapchat"] },
  { key: "linkedin",   label: "💼 LinkedIn",        keywords: ["linkedin"] },
  { key: "website",    label: "🌐 Website/Traffic", keywords: ["website", "traffic", "seo", "web visit"] },
  { key: "other",      label: "⭐ Other",           keywords: [] }, // catch-all
];

// ─── Service-type definitions (detection order matters) ───────────────────────
const SERVICE_TYPES = [
  { key: "followers",    label: "👥 Followers",    keywords: ["follower"] },
  { key: "subscribers",  label: "🔔 Subscribers",  keywords: ["subscriber"] },
  { key: "members",      label: "👥 Members",      keywords: ["member"] },
  { key: "likes",        label: "❤️  Likes",       keywords: ["like"] },
  { key: "views",        label: "👁️  Views",       keywords: ["view", "watch time", "impression", "reel"] },
  { key: "comments",     label: "💬 Comments",     keywords: ["comment"] },
  { key: "shares",       label: "🔄 Shares",       keywords: ["share", "retweet", "repost"] },
  { key: "reactions",    label: "😮 Reactions",    keywords: ["reaction", "emoji"] },
  { key: "saves",        label: "🔖 Saves",        keywords: ["save"] },
  { key: "story",        label: "📖 Story Views",  keywords: ["story"] },
  { key: "live",         label: "📡 Live",         keywords: ["live stream", "live view"] },
  { key: "other",        label: "⭐ Other",        keywords: [] }, // catch-all
];

// ─── Detection helpers ─────────────────────────────────────────────────────────

/**
 * Detect platform from a service object (checks category + name).
 * @param {{ category: string, name: string }} svc
 * @returns {string} platform key
 */
function detectPlatform(svc) {
  const haystack = `${svc.category || ""} ${svc.name || ""}`.toLowerCase();
  for (const p of PLATFORMS) {
    if (p.key === "other") continue;
    if (p.keywords.some((kw) => haystack.includes(kw))) return p.key;
  }
  return "other";
}

/**
 * Detect service type from a service object (checks name).
 * @param {{ name: string }} svc
 * @returns {string} type key
 */
function detectType(svc) {
  const haystack = (svc.name || "").toLowerCase();
  for (const t of SERVICE_TYPES) {
    if (t.key === "other") continue;
    if (t.keywords.some((kw) => haystack.includes(kw))) return t.key;
  }
  return "other";
}

// ─── Grouping ──────────────────────────────────────────────────────────────────

/**
 * Group a flat service array into:
 *   grouped[platformKey][typeKey] = svc[]
 *
 * @param {object[]} services  Raw PerfectPanel API array
 * @returns {object}
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
 * Ordered list of platform keys present in grouped data.
 * Main platforms appear in PLATFORMS order; "other" is always last.
 */
function activePlatforms(grouped) {
  const order = PLATFORMS.map((p) => p.key);
  return order.filter((k) => grouped[k] && Object.keys(grouped[k]).length > 0);
}

/**
 * Ordered list of type keys for a given platform.
 */
function activeTypes(grouped, platformKey) {
  const platform = grouped[platformKey] || {};
  const order    = SERVICE_TYPES.map((t) => t.key);
  return order.filter((k) => platform[k] && platform[k].length > 0);
}

// ─── Label lookups ─────────────────────────────────────────────────────────────

function platformLabel(key) {
  return PLATFORMS.find((p) => p.key === key)?.label ?? `🌐 ${cap(key)}`;
}

function typeLabel(key) {
  return SERVICE_TYPES.find((t) => t.key === key)?.label ?? `⭐ ${cap(key)}`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Pricing helpers ───────────────────────────────────────────────────────────

/**
 * Calculate order cost in NGN.
 * @param {number|string} rateUSD  Rate per 1,000 units (from API)
 * @param {number}        quantity
 * @returns {number}  Cost in NGN, rounded to 2 dp
 */
function calcCostNGN(rateUSD, quantity) {
  return Math.round((quantity / 1000) * parseFloat(rateUSD) * USD_TO_NAIRA * 100) / 100;
}

/**
 * Format a rate for display: "₦750 per 1,000 (~$0.50)"
 * @param {number|string} rateUSD
 * @returns {string}
 */
function fmtRate(rateUSD) {
  const ngn = Math.round(parseFloat(rateUSD) * USD_TO_NAIRA);
  return `₦${ngn.toLocaleString("en-NG")} per 1,000 (~$${parseFloat(rateUSD).toFixed(2)})`;
}

/**
 * Format a naira amount: "₦4,500.00"
 * @param {number} amount
 * @returns {string}
 */
function fmtNGN(amount) {
  return `₦${Number(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

module.exports = {
  USD_TO_NAIRA,
  PLATFORMS,
  SERVICE_TYPES,
  groupServices,
  activePlatforms,
  activeTypes,
  platformLabel,
  typeLabel,
  calcCostNGN,
  fmtRate,
  fmtNGN,
};
