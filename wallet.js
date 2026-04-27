// ============================================================
// wallet.js — In-memory user wallet
//
// ⚠️  TEMPORARY: Balances are stored in a JavaScript Map and
// will be LOST whenever the server restarts (e.g. Render
// redeploy, crash, idle spin-down).
//
// BEFORE GOING FULLY LIVE replace this module with a database
// implementation (e.g. PostgreSQL, MongoDB, Redis) that
// persists balances across restarts.  The exported function
// signatures must stay identical so bot.js needs no changes.
// ============================================================

"use strict";

/** @type {Map<number, number>}  userId → balance in NGN */
const wallets = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (NGN cents). */
function round(n) {
  return Math.round(n * 100) / 100;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the current NGN balance for a user.
 * Creates a zero-balance wallet on first call.
 * @param {number} userId
 * @returns {number}
 */
function getBalance(userId) {
  if (!wallets.has(userId)) wallets.set(userId, 0);
  return wallets.get(userId);
}

/**
 * Add funds to a user's wallet.
 * @param {number} userId
 * @param {number} amountNGN  Must be > 0
 * @returns {number} New balance
 */
function credit(userId, amountNGN) {
  if (amountNGN <= 0) throw new Error("Credit amount must be positive.");
  const next = round(getBalance(userId) + amountNGN);
  wallets.set(userId, next);
  return next;
}

/**
 * Deduct funds from a user's wallet.
 * Throws if balance is insufficient — always call hasEnough() first.
 * @param {number} userId
 * @param {number} amountNGN  Must be > 0
 * @returns {number} New balance
 */
function deduct(userId, amountNGN) {
  if (amountNGN <= 0) throw new Error("Deduct amount must be positive.");
  const current = getBalance(userId);
  if (current < amountNGN) {
    throw new Error(
      `Insufficient balance: have ₦${current.toFixed(2)}, need ₦${amountNGN.toFixed(2)}.`
    );
  }
  const next = round(current - amountNGN);
  wallets.set(userId, next);
  return next;
}

/**
 * Return true if the user can afford the given amount.
 * @param {number} userId
 * @param {number} amountNGN
 * @returns {boolean}
 */
function hasEnough(userId, amountNGN) {
  return getBalance(userId) >= amountNGN;
}

module.exports = { getBalance, credit, deduct, hasEnough };
