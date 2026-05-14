"use strict";

// webhook.js — Express server
//
// Exposes:
//   GET  /health   → Render health check
//   POST /webhook  → KoraPay payment notifications

const express = require("express");
const crypto  = require("crypto");
const { verifyKoraPayment } = require("./api");
const { credit }            = require("./wallet");
const { query }             = require("./db");

const app = express();

app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);

// ─── Bot instance (injected by bot.js) ───────────────────────────────────────
let _bot = null;
function setBotInstance(bot) { _bot = bot; }

// ─── Signature verification ───────────────────────────────────────────────────
function verifySignature(req) {
  const secret    = process.env.KORA_SECRET_KEY;
  const signature = req.headers["x-korapay-signature"];
  if (!secret || !signature) return false;

  const dataStr  = JSON.stringify(req.body?.data ?? {});
  const expected = crypto.createHmac("sha256", secret).update(dataStr).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected,  "hex")
    );
  } catch {
    return false;
  }
}

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ChickletBoost Bot", ts: new Date().toISOString() });
});

// ─── GET /payment-success ─────────────────────────────────────────────────────
app.get("/payment-success", (_req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Payment Successful — ChickletBoost</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 60px 20px; background: #f0fdf4; }
          h2   { color: #16a34a; font-size: 1.8rem; margin-bottom: 12px; }
          p    { color: #374151; font-size: 1rem; margin-bottom: 32px; }
          a    { display: inline-block; background: #16a34a; color: #fff;
                 padding: 14px 28px; border-radius: 8px; text-decoration: none;
                 font-size: 1rem; font-weight: 600; }
          a:hover { background: #15803d; }
        </style>
      </head>
      <body>
        <h2>✅ Payment Successful!</h2>
        <p>Your wallet has been credited.<br>You can return to the bot now.</p>
        <a href="https://t.me/Chickletboost_bot">⬅️ Back to ChickletBoost Bot</a>
      </body>
    </html>
  `);
});

// ─── POST /webhook ────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    if (!verifySignature(req)) {
      console.warn("[webhook] ❌ Invalid signature — rejected.");
      return;
    }

    const event = req.body?.event;
    const data  = req.body?.data;

    if (event !== "charge.success") {
      console.log(`[webhook] Skipping event: "${event}"`);
      return;
    }

    if (!data?.reference) {
      console.warn("[webhook] No reference — skipped.");
      return;
    }

    const { reference } = data;

    // DB-backed idempotency check
    const existing = await query(
      `SELECT 1 FROM processed_payments WHERE reference = $1;`,
      [reference]
    );
    if (existing.rows.length > 0) {
      console.log(`[webhook] Duplicate reference ${reference} — skipped.`);
      return;
    }

    // Re-verify with KoraPay
    let verified;
    try {
      verified = await verifyKoraPayment(reference);
    } catch (err) {
      console.error(`[webhook] KoraPay verify failed for ${reference}:`, err.message);
      return;
    }

    if (verified.status !== "success") {
      console.warn(`[webhook] Status "${verified.status}" — not crediting.`);
      return;
    }

    // Extract telegramId from reference "user_<telegramId>_<timestamp>"
    const telegramId = parseInt(reference.split("_")[1], 10);
    if (!telegramId || isNaN(telegramId)) {
      console.warn(`[webhook] Could not extract telegramId from "${reference}".`);
      return;
    }

    const amountNGN = verified.amount;

    // Mark as processed in DB
    await query(
      `INSERT INTO processed_payments (reference, telegram_id, amount, processed_at)
       VALUES ($1, $2, $3, NOW()) ON CONFLICT (reference) DO NOTHING;`,
      [reference, telegramId, amountNGN]
    );

    // Credit wallet
    const newBalance = await credit(telegramId, amountNGN);

    console.log(
      `[webhook] ✅ Credited ₦${Number(amountNGN).toLocaleString()} to user ${telegramId}. ` +
      `New balance: ₦${Number(newBalance).toLocaleString()}.`
    );

    // Notify user with main menu button
    if (_bot) {
      try {
        const { Markup } = require("telegraf");
        await _bot.telegram.sendMessage(
          telegramId,
          `✅ <b>Payment Confirmed!</b>\n\n` +
          `Amount  : <b>₦${Number(amountNGN).toLocaleString()}</b>\n` +
          `Balance : <b>₦${Number(newBalance).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</b>\n\n` +
          `Your wallet has been credited. Ready to grow? 🚀`,
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("🚀 Start Growth", "ACT:GROWTH")],
              [Markup.button.callback("🏠 Main Menu",    "ACT:CANCEL")],
            ])
          }
        );
      } catch (err) {
        console.warn(`[webhook] Could not notify user ${telegramId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[webhook] Unhandled error:", err.message);
  }
});

// ─── Start Express server ─────────────────────────────────────────────────────
function startServer() {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Express server listening on port ${PORT}`);
  });
}

module.exports = { startServer, setBotInstance };
