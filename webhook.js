"use strict";

// webhook.js — Express server
//
// Exposes:
//   GET  /health   → Render health check
//   POST /webhook  → KoraPay payment notifications
//
// Security:
//   • Verify x-korapay-signature before any processing
//   • Re-verify transaction via KoraPay API before crediting
//   • Idempotency: processed references stored in memory Set
//     ⚠️  In production replace with a DB-backed store to survive restarts.

const express = require("express");
const crypto  = require("crypto");
const { verifyKoraPayment } = require("./api");
const { credit }            = require("./wallet");

const app = express();

// Parse JSON and capture raw body for HMAC verification
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);

// ─── Idempotency store ────────────────────────────────────────────────────────
// ⚠️  TEMPORARY: replace with DB Set before full live launch.
const processedRefs = new Set();

// ─── Bot instance (injected by bot.js after Telegraf is created) ─────────────
let _bot = null;
function setBotInstance(bot) { _bot = bot; }

// ─── Signature verification ───────────────────────────────────────────────────
function verifySignature(req) {
  const secret    = process.env.KORA_SECRET_KEY;
  const signature = req.headers["x-korapay-signature"];
  if (!secret || !signature) return false;

  // KoraPay signs JSON.stringify of the `data` object only
  const dataStr  = JSON.stringify(req.body?.data ?? {});
  const expected = crypto.createHmac("sha256", secret).update(dataStr).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected,  "hex")
    );
  } catch {
    return false; // buffers of different length
  }
}

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ChickletBoost Bot", ts: new Date().toISOString() });
});

// ─── GET /payment-success ─────────────────────────────────────────────────────
// KoraPay redirects the user here after completing payment on their hosted page.
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
  // Always respond 200 immediately; KoraPay retries on non-200 / timeout
  res.sendStatus(200);

  try {
    // 1. Verify signature
    if (!verifySignature(req)) {
      console.warn("[webhook] ❌ Invalid or missing x-korapay-signature — rejected.");
      return;
    }

    const event = req.body?.event;
    const data  = req.body?.data;

    // 2. Only handle successful charge events
    if (event !== "charge.success") {
      console.log(`[webhook] Skipping event type: "${event}"`);
      return;
    }

    if (!data?.reference) {
      console.warn("[webhook] charge.success received without reference — skipped.");
      return;
    }

    const { reference } = data;

    // 3. Idempotency check
    if (processedRefs.has(reference)) {
      console.log(`[webhook] Duplicate reference ${reference} — skipped.`);
      return;
    }

    // 4. Re-verify with KoraPay API before touching wallet
    let verified;
    try {
      verified = await verifyKoraPayment(reference);
    } catch (err) {
      console.error(`[webhook] KoraPay verify failed for ${reference}:`, err.message);
      return;
    }

    if (verified.status !== "success") {
      console.warn(`[webhook] Reference ${reference} — verified status is "${verified.status}" — not crediting.`);
      return;
    }

    // 5. Extract telegramId from reference  "user_<telegramId>_<timestamp>"
    // Using split("_")[1] as specified — reference format is always user_<id>_<ts>
    const telegramId = parseInt(reference.split("_")[1], 10);
    if (!telegramId || isNaN(telegramId)) {
      console.warn(`[webhook] Could not extract telegramId from reference "${reference}".`);
      return;
    }
    const amountNGN  = verified.amount; // use verified amount, never webhook amount

    // 6. Credit wallet and mark reference as processed
    processedRefs.add(reference);
    const newBalance = credit(telegramId, amountNGN);

    console.log(
      `[webhook] ✅ Credited ₦${Number(amountNGN).toLocaleString()} to user ${telegramId}. ` +
      `New balance: ₦${Number(newBalance).toLocaleString()}. Ref: ${reference}`
    );

    // 7. Notify user via Telegram
    if (_bot) {
      try {
        await _bot.telegram.sendMessage(
          telegramId,
          `✅ Payment Confirmed!\n\n` +
          `Amount: ₦${Number(amountNGN).toLocaleString()}\n\n` +
          `Your wallet has been credited. 🚀`,
        );
      } catch (err) {
        // Non-fatal — user may have blocked the bot
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
    console.log(`   GET  /health`);
    console.log(`   POST /webhook`);
    console.log(`   GET  /payment-success`);
  });
}

module.exports = { startServer, setBotInstance };
