"use strict";

// ─── Exchange rate ─────────────────────────────────────────────────────────────
// NOTE: ChickletBoost PerfectPanel returns `rate` already in NGN per 1,000 units.
// NO currency conversion is applied. If your panel ever switches to USD rates,
// re-introduce: cost = (quantity / 1000) * rateUSD * USD_TO_NAIRA

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
  { key: "other",      label: "⭐ Other",           keywords: [] },
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
  { key: "traffic",      label: "🌐 Traffic",      keywords: ["traffic", "visit", "click", "website"] },
  { key: "other",        label: "⭐ Other",        keywords: [] },
];

// ─── Detection helpers ─────────────────────────────────────────────────────────

function detectPlatform(svc) {
  const category = (svc.category || "").toLowerCase();
  const name     = (svc.name || "").toLowerCase();
  const haystack = `${category} ${name}`;

  // 🔥 PRIORITY: detect website using category first (fix applied)
  if (
    category.includes("website") ||
    category.includes("traffic") ||
    category.includes("seo")
  ) {
    return "website";
  }

  for (const p of PLATFORMS) {
    if (p.key === "website" || p.key === "other") continue;
    if (p.keywords.some((kw) => haystack.includes(kw))) return p.key;
  }

  return "other";
}

function detectType(svc, platformKey) {
  const haystack = (svc.name || "").toLowerCase();

  if (platformKey === "website") {
    const trafficKws = ["traffic", "visit", "click", "website"];
    return trafficKws.some((kw) => haystack.includes(kw)) ? "traffic" : "other";
  }

  for (const t of SERVICE_TYPES) {
    if (t.key === "other" || t.key === "traffic") continue;
    if (t.keywords.some((kw) => haystack.includes(kw))) return t.key;
  }
  return "other";
}

// ─── Grouping ──────────────────────────────────────────────────────────────────

function groupServices(services) {
  const grouped = {};
  for (const svc of services) {
    const p = detectPlatform(svc);
    const t = detectType(svc, p);
    if (!grouped[p])    grouped[p] = {};
    if (!grouped[p][t]) grouped[p][t] = [];
    grouped[p][t].push(svc);
  }
  return grouped;
}

function activePlatforms(grouped) {
  const order = PLATFORMS.map((p) => p.key);
  return order.filter((k) => grouped[k] && Object.keys(grouped[k]).length > 0);
}

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

function calcCostNGN(rate, quantity) {
  return Math.round((parseFloat(rate) / 1000) * quantity * 100) / 100;
}

function fmtRate(rate) {
  const ngn = Math.round(parseFloat(rate));
  return `₦${ngn.toLocaleString("en-NG")} per 1,000`;
}

function fmtNGN(amount) {
  return `₦${Number(amount).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

module.exports = {
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
