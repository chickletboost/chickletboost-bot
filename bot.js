"use strict";

// bot.js — ChickletBoost SMM Telegram Bot
//
// Runs Express server (webhook + health) AND Telegraf bot in the same process.
// Required for Render Web Service (must bind a port to stay alive).
//
// Flow state machine:
//   sess(ctx).step drives all multi-turn conversations.
//   resetSession() is called at every top-level action to prevent bleed.

require("dotenv").config();

const { Telegraf, session, Markup } = require("telegraf");
const { startServer, setBotInstance }        = require("./webhook");
const { fetchServices, placeOrder, getOrderStatus, initiateKoraPayment } = require("./api");
const { getBalance, credit, deduct, hasEnough } = require("./wallet");
const {
  groupServices, activePlatforms, activeTypes,
  platformLabel, typeLabel,
  calcCostNGN, fmtRate, fmtNGN,
} = require("./grouping");
const {
  PAGE_SIZE,
  mainMenu, cancelMenu,
  platformsKb, typesKb, servicesKb, fundKb,
} = require("./keyboards");

// ─── Env validation ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ["BOT_TOKEN", "API_KEY", "API_URL", "KORA_SECRET_KEY", "RENDER_URL"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌  Missing required env variable: ${key}`);
    process.exit(1);
  }
}

const WEBSITE_URL     = process.env.WEBSITE_URL     || "https://chickletboost.com";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "";

// ─── Bot initialisation ───────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
setBotInstance(bot); // share bot with webhook.js for user notifications

// ─── Service cache (5-minute TTL) ────────────────────────────────────────────
let _cache       = null;
let _cacheExpiry = 0;

async function loadServices() {
  if (_cache && Date.now() < _cacheExpiry) return _cache;
  const raw = await fetchServices();
  if (!Array.isArray(raw) || raw.length === 0)
    throw new Error("No services returned from API.");
  _cache       = raw;
  _cacheExpiry = Date.now() + 5 * 60 * 1000;
  return _cache;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function sess(ctx) {
  if (!ctx.session) ctx.session = {};
  return ctx.session;
}

/** Clear session state — call at the start of every top-level action. */
function resetSession(ctx) {
  ctx.session = {};
}

// ─── Shorthand helpers ────────────────────────────────────────────────────────

const uid   = (ctx) => ctx.from.id;
const uname = (ctx) => ctx.from.first_name || "there";
const fmtN  = (n)   => Number(n).toLocaleString("en-NG");

/** Answer a callback query silently, swallowing "query too old" errors. */
async function ack(ctx, text = "") {
  try { await ctx.answerCbQuery(text); } catch { /* ignore */ }
}

/**
 * Try to edit the current message; fall back to a new reply.
 * Used only for inline keyboard navigation (not receipts/status).
 */
async function editOrReply(ctx, html, extra = {}) {
  try {
    await ctx.editMessageText(html, { parse_mode: "HTML", ...extra });
  } catch {
    await ctx.replyWithHTML(html, extra);
  }
}

// ─── Restore grouped services from cache ─────────────────────────────────────
async function ensureGrouped(ctx) {
  if (!sess(ctx).grouped) {
    const services    = await loadServices();
    sess(ctx).grouped = groupServices(services);
  }
  return sess(ctx).grouped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// /start command
// ═══════════════════════════════════════════════════════════════════════════════

bot.start(async (ctx) => {
  resetSession(ctx);
  const bal = getBalance(uid(ctx));
  await ctx.replyWithHTML(
    `👋 <b>Welcome to ChickletBoost, ${uname(ctx)}!</b>\n\n` +
    `🚀 Grow your Instagram, TikTok, YouTube & more.\n\n` +
    `💰 Your balance: <b>${fmtNGN(bal)}</b>\n\n` +
    `Choose an option below:`,
    mainMenu
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Top-level actions (ACT:*)
// ═══════════════════════════════════════════════════════════════════════════════

// CANCEL / Main Menu — reachable from any screen
bot.action("ACT:CANCEL", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  const bal = getBalance(uid(ctx));
  await editOrReply(
    ctx,
    `🏠 <b>Main Menu</b>\n\n💰 Balance: <b>${fmtNGN(bal)}</b>`,
    mainMenu
  );
});

// ── 🚀 Start Growth ──────────────────────────────────────────────────────────
bot.action("ACT:GROWTH", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  await editOrReply(ctx, "⏳ Loading platforms...");

  try {
    const grouped = await ensureGrouped(ctx);
    const keys    = activePlatforms(grouped);

    if (keys.length === 0) {
      return editOrReply(ctx, "⚠️ No services available right now. Please try again later.", mainMenu);
    }

    await editOrReply(
      ctx,
      `🌐 <b>Step 1 of 3 — Choose a Platform</b>\n\nSelect the platform you want to grow:`,
      platformsKb(grouped)
    );
  } catch (err) {
    console.error("[GROWTH]", err.message);
    await editOrReply(ctx, `❌ Could not load platforms: ${err.message}`, mainMenu);
  }
});

// ── 📋 Services (quick catalogue view) ───────────────────────────────────────
bot.action("ACT:SERVICES", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  await editOrReply(ctx, "⏳ Fetching services...");

  try {
    const services = await loadServices();
    const preview  = services.slice(0, 15);
    const lines    = preview.map(
      (s, i) =>
        `<b>${i + 1}.</b> #${s.service} — ${s.name}\n` +
        `   ${fmtRate(s.rate)} | Min: ${s.min} | Max: ${s.max}`
    );

    await editOrReply(
      ctx,
      `📋 <b>Service Catalogue</b>\n` +
      `Showing 15 of ${services.length} services.\n\n` +
      lines.join("\n\n") +
      `\n\n<i>Use 🚀 Start Growth to browse by platform and place an order.</i>`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🚀 Start Growth", "ACT:GROWTH")],
        [Markup.button.callback("🏠 Main Menu",    "ACT:CANCEL")],
      ])
    );
  } catch (err) {
    console.error("[SERVICES]", err.message);
    await editOrReply(ctx, `❌ Could not fetch services: ${err.message}`, mainMenu);
  }
});

// ── 💳 Fund Account ───────────────────────────────────────────────────────────
bot.action("ACT:FUND", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  const bal = getBalance(uid(ctx));
  await editOrReply(
    ctx,
    `💳 <b>Fund Your Account</b>\n\n` +
    `Current balance: <b>${fmtNGN(bal)}</b>\n\n` +
    `Select an amount to top up via <b>KoraPay</b>:`,
    fundKb()
  );
});

// Preset amounts
bot.action(/^FND:(\d+)$/, async (ctx) => {
  await ack(ctx);
  const amount = parseInt(ctx.match[1], 10);
  await handleFundAmount(ctx, amount);
});

// Custom amount
bot.action("FND:CUSTOM", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  sess(ctx).step = "FUND_AMOUNT";
  await editOrReply(
    ctx,
    `✏️ <b>Custom Top-Up</b>\n\nEnter the amount in NGN (minimum ₦200):\n<i>Example: 3500</i>`,
    cancelMenu
  );
});

async function handleFundAmount(ctx, amountNGN) {
  if (isNaN(amountNGN) || amountNGN < 200) {
    return ctx.replyWithHTML("⚠️ Minimum top-up amount is <b>₦200</b>.", mainMenu);
  }

  const telegramId = uid(ctx);
  const reference  = `user_${telegramId}_${Date.now()}`;
  const name       = uname(ctx);
  const email      = `user${telegramId}@chickletboost.bot`;

  await editOrReply(ctx, `⏳ Generating your payment link for <b>${fmtNGN(amountNGN)}</b>...`);

  try {
    const { redirectUrl } = await initiateKoraPayment({
      amountNGN,
      reference,
      customerName:  name,
      customerEmail: email,
    });

    await editOrReply(
      ctx,
      `💳 <b>Complete Your Payment</b>\n\n` +
      `Amount    : <b>${fmtNGN(amountNGN)}</b>\n` +
      `Reference : <code>${reference}</code>\n\n` +
      `Tap below to pay securely via KoraPay.\n` +
      `Your wallet will be credited automatically once confirmed. ✅`,
      Markup.inlineKeyboard([
        [Markup.button.url("💳 Pay Now", redirectUrl)],
        [Markup.button.callback("🏠 Main Menu", "ACT:CANCEL")],
      ])
    );
  } catch (err) {
    console.error("[FUND]", err.message);
    await ctx.replyWithHTML(
      `❌ <b>Payment link failed</b>\n\n${err.message}\n\n` +
      `You can also fund your account at:\n${WEBSITE_URL}`,
      mainMenu
    );
  }
}

// ── 💰 Balance ────────────────────────────────────────────────────────────────
bot.action("ACT:BALANCE", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  const bal = getBalance(uid(ctx));
  await editOrReply(
    ctx,
    `💰 <b>Your Wallet</b>\n\n` +
    `Balance : <b>${fmtNGN(bal)}</b>\n\n` +
    `Top up anytime using 💳 Fund Account.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("💳 Fund Account", "ACT:FUND")],
      [Markup.button.callback("🏠 Main Menu",    "ACT:CANCEL")],
    ])
  );
});

// ── 📦 Check Order ────────────────────────────────────────────────────────────
bot.action("ACT:CHECK", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  sess(ctx).step = "ORDER_ID";
  await editOrReply(
    ctx,
    `📦 <b>Check Order Status</b>\n\nEnter your <b>Order ID</b>:`,
    cancelMenu
  );
});

// ── 💬 Support ────────────────────────────────────────────────────────────────
bot.action("ACT:SUPPORT", async (ctx) => {
  await ack(ctx);
  resetSession(ctx);
  const waLink = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}`
    : WEBSITE_URL;

  await editOrReply(
    ctx,
    `💬 <b>Customer Support</b>\n\n` +
    `Our team is available to help you.\n` +
    `Tap below to chat with us on WhatsApp:`,
    Markup.inlineKeyboard([
      [Markup.button.url("💬 Chat on WhatsApp", waLink)],
      [Markup.button.url("🌐 Visit Website",    WEBSITE_URL)],
      [Markup.button.callback("🏠 Main Menu",   "ACT:CANCEL")],
    ])
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Service browser (PLT → TYP → SVC + pagination)
// ═══════════════════════════════════════════════════════════════════════════════

// Platform selected → show service types
bot.action(/^PLT:(.+)$/, async (ctx) => {
  await ack(ctx);
  const platformKey = ctx.match[1];

  try {
    const grouped = await ensureGrouped(ctx);
    if (!grouped[platformKey]) {
      return editOrReply(ctx, "⚠️ Platform not found.", mainMenu);
    }
    sess(ctx).platformKey = platformKey;

    await editOrReply(
      ctx,
      `${platformLabel(platformKey)}\n\n<b>Step 2 of 3 — Choose a Service Type</b>\n\nWhat do you want to grow?`,
      typesKb(grouped, platformKey)
    );
  } catch (err) {
    console.error("[PLT]", err.message);
    await editOrReply(ctx, `❌ Error: ${err.message}`, mainMenu);
  }
});

// Type selected → show paginated services
bot.action(/^TYP:(.+):(.+)$/, async (ctx) => {
  await ack(ctx);
  const platformKey = ctx.match[1];
  const typeKey     = ctx.match[2];

  try {
    const grouped  = await ensureGrouped(ctx);
    const services = grouped[platformKey]?.[typeKey] ?? [];

    if (services.length === 0) {
      return editOrReply(ctx, "⚠️ No services found for this type.", mainMenu);
    }

    sess(ctx).platformKey = platformKey;
    sess(ctx).typeKey     = typeKey;

    await renderServicePage(ctx, services, platformKey, typeKey, 0);
  } catch (err) {
    console.error("[TYP]", err.message);
    await editOrReply(ctx, `❌ Error: ${err.message}`, mainMenu);
  }
});

// Pagination
bot.action(/^PG:(.+):(.+):(\d+)$/, async (ctx) => {
  await ack(ctx);
  const platformKey = ctx.match[1];
  const typeKey     = ctx.match[2];
  const page        = parseInt(ctx.match[3], 10);

  try {
    const grouped  = await ensureGrouped(ctx);
    const services = grouped[platformKey]?.[typeKey] ?? [];
    await renderServicePage(ctx, services, platformKey, typeKey, page);
  } catch (err) {
    console.error("[PG]", err.message);
    await editOrReply(ctx, `❌ Error: ${err.message}`, mainMenu);
  }
});

async function renderServicePage(ctx, services, platformKey, typeKey, page) {
  const start = page * PAGE_SIZE;
  const slice = services.slice(start, start + PAGE_SIZE);
  const total = services.length;

  const lines = slice.map(
    (svc, i) =>
      `<b>${start + i + 1}.</b> #${svc.service} — ${svc.name}\n` +
      `   📊 ${fmtRate(svc.rate)} | Min: ${fmtN(svc.min)} | Max: ${fmtN(svc.max)}`
  );

  const header =
    `${platformLabel(platformKey)} › ${typeLabel(typeKey)}\n` +
    `<b>Step 3 of 3 — Choose a Service</b>\n` +
    `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}\n\n` +
    lines.join("\n\n");

  await editOrReply(ctx, header, servicesKb(services, platformKey, typeKey, page));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service selected → begin order flow
// ═══════════════════════════════════════════════════════════════════════════════

bot.action(/^SVC:(\d+)$/, async (ctx) => {
  await ack(ctx);
  const serviceId = ctx.match[1];

  try {
    const allServices = await loadServices();
    const svc         = allServices.find((s) => String(s.service) === serviceId);

    if (!svc) {
      return ctx.replyWithHTML("❌ Service not found. Please go back and try again.", mainMenu);
    }

    const bal = getBalance(uid(ctx));

    // Store pending order in session
    sess(ctx).step  = "LINK";
    sess(ctx).order = {
      serviceId: svc.service,
      name:      svc.name,
      rate:      svc.rate,
      min:       Number(svc.min),
      max:       Number(svc.max),
    };

    // Send as a NEW message so the service list stays visible above it
    await ctx.replyWithHTML(
      `✅ <b>Service Selected</b>\n\n` +
      `📌 <b>${svc.name}</b>\n` +
      `🆔 ID       : <code>${svc.service}</code>\n` +
      `💲 Rate     : ${fmtRate(svc.rate)}\n` +
      `📊 Min/Max  : ${fmtN(svc.min)} / ${fmtN(svc.max)}\n\n` +
      `💰 Your balance: <b>${fmtNGN(bal)}</b>\n\n` +
      `🔗 <b>Send your post or profile link:</b>`,
      cancelMenu
    );
  } catch (err) {
    console.error("[SVC]", err.message);
    await ctx.replyWithHTML(`❌ Error: ${err.message}`, mainMenu);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// /status command shortcut
// ═══════════════════════════════════════════════════════════════════════════════

bot.command("status", async (ctx) => {
  resetSession(ctx);
  sess(ctx).step = "ORDER_ID";
  await ctx.replyWithHTML(
    `📦 <b>Check Order Status</b>\n\nEnter your <b>Order ID</b>:`,
    cancelMenu
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// /balance command shortcut
// ═══════════════════════════════════════════════════════════════════════════════

bot.command("balance", async (ctx) => {
  resetSession(ctx);
  const bal = getBalance(uid(ctx));
  await ctx.replyWithHTML(
    `💰 <b>Balance: ${fmtNGN(bal)}</b>`,
    mainMenu
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Universal text handler — state machine
// ═══════════════════════════════════════════════════════════════════════════════

bot.on("text", async (ctx) => {
  // Skip bot commands — they have their own handlers
  if (ctx.message.text.startsWith("/")) return;

  const s      = sess(ctx);
  const text   = ctx.message.text.trim();
  const userId = uid(ctx);

  switch (s.step) {

    // ── Custom fund amount ──────────────────────────────────────────────────
    case "FUND_AMOUNT": {
      s.step = null;
      const amount = parseInt(text.replace(/[^\d]/g, ""), 10);
      if (!amount || amount < 200) {
        return ctx.replyWithHTML(
          "⚠️ Please enter a valid amount of at least <b>₦200</b>."
        );
      }
      await handleFundAmount(ctx, amount);
      break;
    }

    // ── Order: waiting for link ─────────────────────────────────────────────
    case "LINK": {
      if (!text.startsWith("http://") && !text.startsWith("https://")) {
        return ctx.replyWithHTML(
          "⚠️ Please send a valid URL starting with <b>https://</b>",
          cancelMenu
        );
      }
      s.order.link = text;
      s.step       = "QUANTITY";

      const { min, max, rate, name } = s.order;
      await ctx.replyWithHTML(
        `🔢 <b>Enter Quantity</b>\n\n` +
        `Service  : <b>${name}</b>\n` +
        `Rate     : ${fmtRate(rate)}\n` +
        `Min      : <b>${fmtN(min)}</b>\n` +
        `Max      : <b>${fmtN(max)}</b>\n\n` +
        `💰 Balance: <b>${fmtNGN(getBalance(userId))}</b>\n\n` +
        `How many units do you want?`,
        cancelMenu
      );
      break;
    }

    // ── Order: waiting for quantity ─────────────────────────────────────────
    case "QUANTITY": {
      const qty = parseInt(text.replace(/[^\d]/g, ""), 10);
      const { min, max, serviceId, name, link, rate } = s.order;

      if (!qty || isNaN(qty)) {
        return ctx.replyWithHTML("⚠️ Please enter a valid whole number.", cancelMenu);
      }
      if (qty < min || qty > max) {
        return ctx.replyWithHTML(
          `⚠️ Quantity must be between <b>${fmtN(min)}</b> and <b>${fmtN(max)}</b>.`,
          cancelMenu
        );
      }

      const cost = calcCostNGN(rate, qty);
      const bal  = getBalance(userId);

      // ── Insufficient balance ──────────────────────────────────────────────
      if (!hasEnough(userId, cost)) {
        s.step  = null;
        s.order = null;
        return ctx.replyWithHTML(
          `❌ <b>Insufficient Balance</b>\n\n` +
          `Order cost  : <b>${fmtNGN(cost)}</b>\n` +
          `Your balance: <b>${fmtNGN(bal)}</b>\n` +
          `Shortfall   : <b>${fmtNGN(cost - bal)}</b>\n\n` +
          `Please top up your account to continue.`,
          Markup.inlineKeyboard([
            [Markup.button.callback("💳 Fund Account", "ACT:FUND")],
            [Markup.button.callback("🏠 Main Menu",    "ACT:CANCEL")],
          ])
        );
      }

      // ── Summary ───────────────────────────────────────────────────────────
      s.step = null;

      await ctx.replyWithHTML(
        `📋 <b>Order Summary</b>\n\n` +
        `Service  : ${name}\n` +
        `Quantity : ${fmtN(qty)}\n` +
        `Link     : <code>${link}</code>\n` +
        `Cost     : <b>${fmtNGN(cost)}</b>\n` +
        `Balance  : ${fmtNGN(bal)} → <b>${fmtNGN(bal - cost)}</b>\n\n` +
        `⏳ Placing your order...`
      );

      // ── Deduct wallet, then call API ──────────────────────────────────────
      let newBal;
      try {
        newBal = deduct(userId, cost);
      } catch (walletErr) {
        s.order = null;
        return ctx.replyWithHTML(`❌ ${walletErr.message}`, mainMenu);
      }

      try {
        const { orderId } = await placeOrder(serviceId, link, qty);
        s.order = null;

        // ── Receipt — send as new message, never edit ─────────────────────
        await ctx.replyWithHTML(
          `🎉 <b>Order Receipt</b>\n` +
          `${"─".repeat(30)}\n` +
          `Order ID  : <code>${orderId}</code>\n` +
          `Service   : ${name}\n` +
          `Quantity  : ${fmtN(qty)}\n` +
          `Link      : <code>${link}</code>\n` +
          `Cost      : <b>${fmtNGN(cost)}</b>\n` +
          `Balance   : <b>${fmtNGN(newBal)}</b>\n` +
          `${"─".repeat(30)}\n\n` +
          `Results start within 0–24 hours.\n` +
          `Use 📦 Check Order to track progress.`,
          mainMenu
        );
      } catch (apiErr) {
        // ── Refund on API failure ─────────────────────────────────────────
        credit(userId, cost);
        s.order = null;
        await ctx.replyWithHTML(
          `❌ <b>Order Failed</b>\n\n` +
          `Error: ${apiErr.message}\n\n` +
          `<b>${fmtNGN(cost)}</b> has been refunded to your wallet.\n` +
          `Balance restored: <b>${fmtNGN(bal)}</b>`,
          mainMenu
        );
      }
      break;
    }

    // ── Check order: waiting for order ID ────────────────────────────────────
    case "ORDER_ID": {
      s.step = null;
      const orderId = text.replace(/\D/g, "");

      if (!orderId) {
        return ctx.replyWithHTML(
          "⚠️ Please enter a valid numeric Order ID.",
          cancelMenu
        );
      }

      await ctx.replyWithHTML("🔍 Fetching order status...");

      try {
        const r = await getOrderStatus(orderId);
        const statusEmoji = {
          Pending:       "⏳",
          "In progress": "🔄",
          Processing:    "🔄",
          Completed:     "✅",
          Partial:       "⚠️",
          Canceled:      "❌",
          Refunded:      "💸",
        }[r.status] ?? "📊";

        // Send as new message — never edit
        await ctx.replyWithHTML(
          `📦 <b>Order Status</b>\n` +
          `${"─".repeat(30)}\n` +
          `Order ID    : <code>${orderId}</code>\n` +
          `${statusEmoji} Status : <b>${r.status}</b>\n` +
          `Start Count : ${fmtN(r.startCount)}\n` +
          `Remaining   : ${fmtN(r.remains)}\n` +
          `Charge      : ${r.charge}\n` +
          `${"─".repeat(30)}`,
          mainMenu
        );
      } catch (err) {
        await ctx.replyWithHTML(
          `❌ Could not fetch order status.\n\nError: ${err.message}`,
          mainMenu
        );
      }
      break;
    }

    // ── No active flow — show main menu ───────────────────────────────────────
    default: {
      const bal = getBalance(userId);
      await ctx.replyWithHTML(
        `💰 Balance: <b>${fmtNGN(bal)}</b>\n\nUse the menu below:`,
        mainMenu
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Global error handler
// ═══════════════════════════════════════════════════════════════════════════════

bot.catch((err, ctx) => {
  console.error(`[BotError] update_type=${ctx.updateType}:`, err.message);
  ctx.replyWithHTML(
    "⚠️ Something went wrong. Please try again or use /start to reset.",
    mainMenu
  ).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Launch — Express server + Telegram bot together (required for Render)
// ═══════════════════════════════════════════════════════════════════════════════

startServer(); // binds process.env.PORT — keeps Render Web Service alive
bot.launch().then(() => {
  console.log("✅ ChickletBoost Telegram bot is running.");
});

// Graceful shutdown
process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
