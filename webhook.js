// webhook.js — Express server for KoraPay webhook notifications
//
// Verified from KoraPay docs:
//   Event name      : "charge.success"
//   Signature header: "x-korapay-signature"
//   Signature algo  : HMAC-SHA256 of JSON.stringify(req.body.data) using KORA_SECRET_KEY
//   Fields used     : data.reference, data.amount, data.status
//
// Security rules applied:
//   1. Verify x-korapay-signature before doing anything
//   2. Requery transaction via GET /charges/:ref to confirm status independently
//   3. Only credit if verified status === "success"
//   4. Idempotency: reject already-processed references

const express    = require("express");
const crypto     = require("crypto");
const { verifyKoraPayment } = require("./api");
const { credit }            = require("./wallet");

const app = express();

// Parse raw body so we can verify HMAC before touching parsed JSON.
// We store the raw buffer on req.rawBody and also parse JSON normally.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ─── In-memory idempotency store ─────────────────────────────────────────────
// Maps reference → true for every successfully processed webhook.
// Replace with a DB Set in production.
const processedRefs = new Set();

// ─── Telegram bot instance (injected after bot.js creates it) ─────────────────
let _bot = null;
function setBotInstance(bot) {
  _bot = bot;
}

// ─── Signature verification helper ───────────────────────────────────────────
function verifySignature(req) {
  const secret    = process.env.KORA_SECRET_KEY;
  const signature = req.headers["x-korapay-signature"];

  if (!secret)    throw new Error("KORA_SECRET_KEY not set — cannot verify signature.");
  if (!signature) return false;

  // KoraPay signs ONLY the `data` object (not the full body).
  // We reserialise req.body.data to match exactly what Kora signed.
  const dataString = JSON.stringify(req.body?.data ?? {});
  const expected   = crypto
    .createHmac("sha256", secret)
    .update(dataString)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected,  "hex")
    );
  } catch {
    return false; // buffers of different length → invalid
  }
}

// ─── POST /webhook ────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  // 1. Always respond 200 immediately — KoraPay retries on non-200 or timeout.
  //    We do all processing after sending the response.
  res.sendStatus(200);

  try {
    // 2. Verify signature
    if (!verifySignature(req)) {
      console.warn("[webhook] ⚠️  Invalid or missing x-korapay-signature — request rejected.");
      return;
    }

    const event = req.body?.event;
    const data  = req.body?.data;

    // 3. Only process successful charge events
    if (event !== "charge.success") {
      console.log(`[webhook] Skipping event: ${event}`);
      return;
    }

    if (!data) {
      console.warn("[webhook] charge.success received but data object is empty.");
      return;
    }

    const { reference, amount, status } = data;

    if (!reference) {
      console.warn("[webhook] charge.success received without a reference.");
      return;
    }

    // 4. Idempotency check
    if (processedRefs.has(reference)) {
      console.log(`[webhook] Duplicate webhook for reference ${reference} — skipped.`);
      return;
    }

    // 5. Re-verify the transaction via API before crediting (defence-in-depth)
    let verified;
    try {
      verified = await verifyKoraPayment(reference);
    } catch (err) {
      console.error(`[webhook] Failed to verify reference ${reference}:`, err.message);
      return;
    }

    if (verified.status !== "success") {
      console.warn(`[webhook] Reference ${reference} verified status is "${verified.status}" — not crediting.`);
      return;
    }

    // 6. Extract telegramId from reference: "user_<telegramId>_<timestamp>"
    const match = reference.match(/^user_(\d+)_\d+$/);
    if (!match) {
      console.warn(`[webhook] Reference "${reference}" does not match expected pattern — cannot extract telegramId.`);
      return;
    }
    const telegramId  = parseInt(match[1], 10);
    const amountNGN   = verified.amount; // use verified amount, not webhook amount

    // 7. Credit the wallet and mark reference as processed
    processedRefs.add(reference);
    const newBalance = credit(telegramId, amountNGN);

    console.log(
      `[webhook] ✅ Credited ${amountNGN} NGN to user ${telegramId}. ` +
      `New balance: ${newBalance} NGN. Ref: ${reference}`
    );

    // 8. Notify user in Telegram
    if (_bot) {
      try {
        await _bot.telegram.sendMessage(
          telegramId,
          `✅ <b>Payment Confirmed!</b>\n\n` +
          `Amount    : <b>₦${Number(amountNGN).toLocaleString()}</b>\n` +
          `Reference : <code>${reference}</code>\n` +
          `New balance: <b>₦${Number(newBalance).toLocaleString()}</b>\n\n` +
          `You can now place orders 🚀`,
          { parse_mode: "HTML" }
        );
      } catch (err) {
        // Non-fatal — user may have blocked the bot
        console.warn(`[webhook] Could not send Telegram message to ${telegramId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[webhook] Unhandled error:", err.message);
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

function startWebhookServer() {
  app.listen(PORT, () => {
    console.log(`✅ Webhook server listening on port ${PORT}`);
  });
}

module.exports = { startWebhookServer, setBotInstance };
