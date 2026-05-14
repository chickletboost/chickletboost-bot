"use strict";

// poller.js — Background order status checker + auto-refund
//
// Tracks active orders in PostgreSQL so restarts don't lose them.
// Every POLL_INTERVAL ms, checks each order with PerfectPanel.
// On "Cancelled" → full refund. On "Partial" → partial refund for remains.
// Notifies users via Telegram message.

const { getOrderStatus } = require("./api");
const { credit }         = require("./wallet");
const { query }          = require("./db");

const POLL_INTERVAL = 3 * 60 * 1000;       // check every 3 minutes
const MAX_AGE_MS    = 24 * 60 * 60 * 1000; // stop tracking after 24 hours

let _bot = null;

function init(bot) {
  _bot = bot;
  setInterval(pollAll, POLL_INTERVAL);
  console.log(`[Poller] Started — checking every ${POLL_INTERVAL / 1000}s`);
}

async function trackOrder(orderId, userId, cost, quantity, name) {
  await query(
    `INSERT INTO tracked_orders (order_id, user_id, cost, quantity, name, placed_at, notified)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE)
     ON CONFLICT (order_id) DO NOTHING;`,
    [String(orderId), userId, cost, quantity, name, Date.now()]
  );
  console.log(`[Poller] Tracking order ${orderId} for user ${userId}`);
}

async function pollAll() {
  const res = await query(`SELECT * FROM tracked_orders WHERE notified = FALSE;`);
  const orders = res.rows;
  if (orders.length === 0) return;

  console.log(`[Poller] Checking ${orders.length} active order(s)...`);

  for (const order of orders) {
    if (Date.now() - Number(order.placed_at) > MAX_AGE_MS) {
      console.log(`[Poller] Order ${order.order_id} expired — removing`);
      await query(`DELETE FROM tracked_orders WHERE order_id = $1;`, [order.order_id]);
      continue;
    }

    try {
      const { status, remains } = await getOrderStatus(order.order_id);

      if (status === "Cancelled") {
        await handleCancelled(order);
      } else if (status === "Partial") {
        await handlePartial(order, remains);
      } else if (status === "Completed" || status === "Refunded") {
        console.log(`[Poller] Order ${order.order_id} is ${status} — removing`);
        await query(`DELETE FROM tracked_orders WHERE order_id = $1;`, [order.order_id]);
      }
    } catch (err) {
      console.error(`[Poller] Error checking order ${order.order_id}:`, err.message);
    }
  }
}

async function handleCancelled(order) {
  const refundAmount = parseFloat(order.cost);
  const newBal = await credit(order.user_id, refundAmount);

  console.log(`[Poller] Order ${order.order_id} CANCELLED — refunding ₦${refundAmount} to user ${order.user_id}`);

  await notify(
    order.user_id,
    `❌ <b>Order Cancelled &amp; Refunded</b>\n\n` +
    `Order ID  : <code>${order.order_id}</code>\n` +
    `Service   : ${order.name}\n\n` +
    `Your order was cancelled by the provider.\n` +
    `<b>₦${refundAmount.toFixed(2)}</b> has been refunded to your wallet.\n` +
    `💰 New balance: <b>₦${newBal.toFixed(2)}</b>`
  );

  await query(`DELETE FROM tracked_orders WHERE order_id = $1;`, [order.order_id]);
}

async function handlePartial(order, remains) {
  const remainsNum = Number(remains);
  const quantity   = Number(order.quantity);
  const cost       = parseFloat(order.cost);

  const refundAmount = isNaN(remainsNum) || remainsNum <= 0 || quantity <= 0
    ? 0
    : Math.round((remainsNum / quantity) * cost * 100) / 100;

  console.log(`[Poller] Order ${order.order_id} PARTIAL — remains=${remainsNum}, refunding ₦${refundAmount}`);

  let msg =
    `⚠️ <b>Order Partially Completed</b>\n\n` +
    `Order ID  : <code>${order.order_id}</code>\n` +
    `Service   : ${order.name}\n` +
    `Delivered : ${quantity - remainsNum} / ${quantity}\n`;

  if (refundAmount > 0) {
    const newBal = await credit(order.user_id, refundAmount);
    msg +=
      `\n<b>₦${refundAmount.toFixed(2)}</b> refunded for the undelivered portion.\n` +
      `💰 New balance: <b>₦${newBal.toFixed(2)}</b>`;
  } else {
    msg += `\nNo refund applicable.`;
  }

  await notify(order.user_id, msg);
  await query(`DELETE FROM tracked_orders WHERE order_id = $1;`, [order.order_id]);
}

async function notify(userId, html) {
  if (!_bot) return;
  try {
    await _bot.telegram.sendMessage(userId, html, { parse_mode: "HTML" });
  } catch (err) {
    console.error(`[Poller] Failed to notify user ${userId}:`, err.message);
  }
}

module.exports = { init, trackOrder };
