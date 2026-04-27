"use strict";

// keyboards.js — Inline keyboard builders.
// All functions are pure: same input → same keyboard.
// No session state lives here.

const { Markup } = require("telegraf");
const { activePlatforms, activeTypes, platformLabel, typeLabel, fmtRate } = require("./grouping");

const PAGE_SIZE = 10; // services shown per page

// ─── Static menus ──────────────────────────────────────────────────────────────

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback("🚀 Start Growth", "ACT:GROWTH")],
  [
    Markup.button.callback("📋 Services",    "ACT:SERVICES"),
    Markup.button.callback("💳 Fund Account","ACT:FUND"),
  ],
  [
    Markup.button.callback("💰 Balance",     "ACT:BALANCE"),
    Markup.button.callback("📦 Check Order", "ACT:CHECK"),
  ],
  [Markup.button.callback("💬 Support",      "ACT:SUPPORT")],
]);

const cancelMenu = Markup.inlineKeyboard([
  [Markup.button.callback("❌ Cancel → Main Menu", "ACT:CANCEL")],
]);

// ─── Dynamic menus ─────────────────────────────────────────────────────────────

/**
 * Platform selection.
 * @param {object} grouped  Output of groupServices()
 */
function platformsKb(grouped) {
  const keys    = activePlatforms(grouped);
  const buttons = keys.map((k) => [
    Markup.button.callback(platformLabel(k), `PLT:${k}`),
  ]);
  buttons.push([Markup.button.callback("🏠 Main Menu", "ACT:CANCEL")]);
  return Markup.inlineKeyboard(buttons);
}

/**
 * Service-type selection for a platform.
 * @param {object} grouped
 * @param {string} platformKey
 */
function typesKb(grouped, platformKey) {
  const keys    = activeTypes(grouped, platformKey);
  const buttons = keys.map((k) => [
    Markup.button.callback(typeLabel(k), `TYP:${platformKey}:${k}`),
  ]);
  buttons.push([Markup.button.callback("◀ Platforms", "ACT:GROWTH")]);
  buttons.push([Markup.button.callback("🏠 Main Menu", "ACT:CANCEL")]);
  return Markup.inlineKeyboard(buttons);
}

/**
 * Paginated service list.
 * @param {object[]} services   All services for this platform+type
 * @param {string}   platformKey
 * @param {string}   typeKey
 * @param {number}   page       0-indexed
 */
function servicesKb(services, platformKey, typeKey, page = 0) {
  const start = page * PAGE_SIZE;
  const slice = services.slice(start, start + PAGE_SIZE);
  const total = services.length;

  const buttons = slice.map((svc) => [
    Markup.button.callback(
      `#${svc.service} — ${trunc(svc.name, 36)}`,
      `SVC:${svc.service}`
    ),
  ]);

  // Pagination row
  const nav = [];
  if (page > 0)
    nav.push(Markup.button.callback("◀ Prev", `PG:${platformKey}:${typeKey}:${page - 1}`));
  if (start + PAGE_SIZE < total)
    nav.push(Markup.button.callback("Next ▶", `PG:${platformKey}:${typeKey}:${page + 1}`));
  if (nav.length) buttons.push(nav);

  buttons.push([Markup.button.callback(`◀ Back`, `PLT:${platformKey}`)]);
  buttons.push([Markup.button.callback("🏠 Main Menu", "ACT:CANCEL")]);
  return Markup.inlineKeyboard(buttons);
}

/**
 * Fund account preset NGN amounts.
 */
function fundKb() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("₦1,000",  "FND:1000"),
      Markup.button.callback("₦2,000",  "FND:2000"),
      Markup.button.callback("₦5,000",  "FND:5000"),
    ],
    [
      Markup.button.callback("₦10,000", "FND:10000"),
      Markup.button.callback("₦20,000", "FND:20000"),
      Markup.button.callback("₦50,000", "FND:50000"),
    ],
    [Markup.button.callback("✏️ Custom Amount", "FND:CUSTOM")],
    [Markup.button.callback("🏠 Main Menu",     "ACT:CANCEL")],
  ]);
}

// ─── Utility ───────────────────────────────────────────────────────────────────

function trunc(str, n) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

module.exports = {
  PAGE_SIZE,
  mainMenu,
  cancelMenu,
  platformsKb,
  typesKb,
  servicesKb,
  fundKb,
};
