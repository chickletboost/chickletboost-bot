// bot.js — Main entry point for the SMM Telegram bot.
// Run: node bot.js   (after copying .env.example → .env and filling values)

require("dotenv").config();

const { Telegraf, session } = require("telegraf");
const { mainMenu, platformMenu, serviceMenu, packageMenu } = require("./keyboards");
const { placeOrder, getOrderStatus } = require("./api");
const services = require("./services");

// ─── Validate environment ───────────────────────────────────────────────────
if (!process.env.BOT_TOKEN) {
  console.error("❌  BOT_TOKEN is missing. Copy .env.example → .env and fill it in.");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── Session middleware (stores per-user state) ──────────────────────────────
bot.use(session());

function getSession(ctx) {
  if (!ctx.session) ctx.session = {};
  return ctx.session;
}

// ─── /start ─────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const name = ctx.from.first_name || "there";
  await ctx.replyWithHTML(
    `👋 <b>Welcome, ${name}!</b>\n\n` +
    `I'm your <b>Social Media Growth Bot</b> 🚀\n` +
    `Grow your Instagram, TikTok & YouTube fast.\n\n` +
    `What would you like to do today?`,
    mainMenu
  );
});

// ─── Back to main menu ───────────────────────────────────────────────────────
bot.action("back_main", async (ctx) => {
  await ctx.editMessageText(
    "🏠 <b>Main Menu</b>\n\nChoose an option below:",
    { parse_mode: "HTML", ...mainMenu }
  );
});

// ─── Start Growth → Platform selection ──────────────────────────────────────
bot.action("start_growth", async (ctx) => {
  await ctx.editMessageText(
    "🌐 <b>Select a platform to grow:</b>",
    { parse_mode: "HTML", ...platformMenu }
  );
});

// ─── Platform selected → Service type selection ──────────────────────────────
bot.action(/^platform_(.+)$/, async (ctx) => {
  const platformKey = ctx.match[1];
  const platform = services[platformKey];
  if (!platform) return ctx.answerCbQuery("Unknown platform.");

  await ctx.editMessageText(
    `${platform.label} — <b>Choose a service:</b>`,
    { parse_mode: "HTML", ...serviceMenu(platformKey) }
  );
});

// ─── Service selected → Package selection ────────────────────────────────────
bot.action(/^service_(.+)_(.+)$/, async (ctx) => {
  const [, platformKey, serviceKey] = ctx.match;
  const service = services[platformKey]?.services[serviceKey];
  if (!service) return ctx.answerCbQuery("Unknown service.");

  await ctx.editMessageText(
    `${service.label} — <b>Choose a package:</b>`,
    { parse_mode: "HTML", ...packageMenu(platformKey, serviceKey) }
  );
});

// ─── Package selected → Ask for link ────────────────────────────────────────
bot.action(/^pkg_(.+)_(.+)_(\d+)$/, async (ctx) => {
  const [, platformKey, serviceKey, idxStr] = ctx.match;
  const idx = parseInt(idxStr, 10);
  const pkg = services[platformKey]?.services[serviceKey]?.packages[idx];
  if (!pkg) return ctx.answerCbQuery("Package not found.");

  const sess = getSession(ctx);
  sess.pendingOrder = { platformKey, serviceKey, pkg };
  sess.awaitingLink = true;

  await ctx.editMessageText(
    `✅ <b>Package selected:</b> ${pkg.label} — ${pkg.price}\n\n` +
    `🔗 Please send the <b>link</b> to your post or profile now:`,
    { parse_mode: "HTML" }
  );
  await ctx.answerCbQuery();
});

// ─── Receive link from user ──────────────────────────────────────────────────
bot.on("text", async (ctx) => {
  const sess = getSession(ctx);

  // ── Waiting for a post link ──
  if (sess.awaitingLink) {
    const link = ctx.message.text.trim();
    sess.awaitingLink = false;

    const { platformKey, serviceKey, pkg } = sess.pendingOrder;
    const platform = services[platformKey].label;
    const service  = services[platformKey].services[serviceKey].label;

    await ctx.replyWithHTML(
      `📋 <b>Order Summary</b>\n\n` +
      `Platform : ${platform}\n` +
      `Service  : ${service}\n` +
      `Package  : ${pkg.label}\n` +
      `Price    : ${pkg.price}\n` +
      `Link     : <code>${link}</code>\n\n` +
      `⏳ Placing your order, please wait...`
    );

    try {
      const { orderId } = await placeOrder(pkg.apiServiceId, link, pkg.qty);
      sess.pendingOrder = null;
      await ctx.replyWithHTML(
        `🎉 <b>Order Placed Successfully!</b>\n\n` +
        `Order ID : <code>${orderId}</code>\n\n` +
        `Use /status to check your order anytime.\n` +
        `Results usually start within <b>1–24 hours</b>.`,
        mainMenu
      );
    } catch (err) {
      console.error("Order error:", err.message);
      await ctx.reply(
        `❌ Failed to place order: ${err.message}\n\nPlease try again or contact support.`,
        mainMenu
      );
    }
    return;
  }

  // ── Waiting for an order ID to check status ──
  if (sess.awaitingOrderId) {
    const orderId = ctx.message.text.trim();
    sess.awaitingOrderId = false;

    await ctx.reply("🔍 Fetching order status...");

    try {
      const result = await getOrderStatus(orderId);
      await ctx.replyWithHTML(
        `📦 <b>Order Status</b>\n\n` +
        `Order ID    : <code>${orderId}</code>\n` +
        `Status      : <b>${result.status}</b>\n` +
        `Start Count : ${result.startCount}\n` +
        `Remaining   : ${result.remains}\n` +
        `Charged     : ${result.charge}`,
        mainMenu
      );
    } catch (err) {
      console.error("Status error:", err.message);
      await ctx.reply(
        `❌ Could not retrieve status: ${err.message}`,
        mainMenu
      );
    }
    return;
  }
});

// ─── /status command ─────────────────────────────────────────────────────────
bot.command("status", async (ctx) => {
  const sess = getSession(ctx);
  sess.awaitingOrderId = true;
  await ctx.reply("📦 Please enter your <b>Order ID</b>:", { parse_mode: "HTML" });
});

// ─── Check Order button ──────────────────────────────────────────────────────
bot.action("check_order", async (ctx) => {
  const sess = getSession(ctx);
  sess.awaitingOrderId = true;
  await ctx.editMessageText(
    "📦 Please enter your <b>Order ID</b>:",
    { parse_mode: "HTML" }
  );
  await ctx.answerCbQuery();
});

// ─── Add Funds ───────────────────────────────────────────────────────────────
bot.action("add_funds", async (ctx) => {
  const websiteUrl = process.env.WEBSITE_URL || "https://chickletboost.com";
  await ctx.editMessageText(
    `💳 <b>Add Funds to Your Account</b>\n\n` +
    `To top up your balance, visit our website and log in:\n` +
    `👉 ${websiteUrl}\n\n` +
    `We accept:\n` +
    `• Credit / Debit Cards\n` +
    `• Crypto (BTC, USDT)\n` +
    `• PayPal\n\n` +
    `Funds are credited instantly after payment.`,
    { parse_mode: "HTML", ...require("telegraf").Markup.inlineKeyboard([
      [require("telegraf").Markup.button.url("🌐 Open Website", websiteUrl)],
      [require("telegraf").Markup.button.callback("🔙 Back", "back_main")],
    ])}
  );
});

// ─── Support ─────────────────────────────────────────────────────────────────
bot.action("support", async (ctx) => {
  const whatsapp = process.env.WHATSAPP_NUMBER || "1234567890";
  const waLink   = `https://wa.me/${whatsapp}`;
  await ctx.editMessageText(
    `💬 <b>Customer Support</b>\n\n` +
    `Our team is ready to help you 24/7.\n\n` +
    `Click below to chat with us on WhatsApp:`,
    { parse_mode: "HTML", ...require("telegraf").Markup.inlineKeyboard([
      [require("telegraf").Markup.button.url("💬 WhatsApp Support", waLink)],
      [require("telegraf").Markup.button.callback("🔙 Back", "back_main")],
    ])}
  );
});

// ─── Error handler ────────────────────────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply("⚠️ Something went wrong. Please try again or contact support.");
});

// ─── Launch ───────────────────────────────────────────────────────────────────
bot.launch().then(() => {
  console.log("✅ SMM Bot is running...");
});

// Graceful stop
process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
bot.on("message", (ctx) => {
  console.log("MESSAGE RECEIVED:", ctx.message.text);
});
