"use strict";

// wallet.js — Persistent wallet backed by PostgreSQL
//
// Drop-in replacement for the in-memory wallet.
// Exported function signatures are identical — bot.js needs no changes.

const { query } = require("./db");

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Return the current NGN balance for a user.
 * Creates a zero-balance row on first call.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function getBalance(userId) {
  const res = await query(
    `INSERT INTO wallets (user_id, balance)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING;
     SELECT balance FROM wallets WHERE user_id = $1;`,
    [userId]
  );
  // pg returns results for each statement; balance is in the last one
  const rows = res[1]?.rows ?? res.rows;
  return parseFloat(rows[0]?.balance ?? 0);
}

/**
 * Add funds to a user's wallet.
 * @param {number} userId
 * @param {number} amountNGN  Must be > 0
 * @returns {Promise<number>} New balance
 */
async function credit(userId, amountNGN) {
  if (amountNGN <= 0) throw new Error("Credit amount must be positive.");
  const res = await query(
    `INSERT INTO wallets (user_id, balance)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET balance = wallets.balance + $2
     RETURNING balance;`,
    [userId, round(amountNGN)]
  );
  return parseFloat(res.rows[0].balance);
}

/**
 * Deduct funds from a user's wallet.
 * Throws if balance is insufficient.
 * @param {number} userId
 * @param {number} amountNGN  Must be > 0
 * @returns {Promise<number>} New balance
 */
async function deduct(userId, amountNGN) {
  if (amountNGN <= 0) throw new Error("Deduct amount must be positive.");

  const res = await query(
    `UPDATE wallets
     SET balance = balance - $2
     WHERE user_id = $1 AND balance >= $2
     RETURNING balance;`,
    [userId, round(amountNGN)]
  );

  if (res.rows.length === 0) {
    const cur = await getBalance(userId);
    throw new Error(
      `Insufficient balance: have ₦${cur.toFixed(2)}, need ₦${amountNGN.toFixed(2)}.`
    );
  }

  return parseFloat(res.rows[0].balance);
}

/**
 * Return true if the user can afford the given amount.
 * @param {number} userId
 * @param {number} amountNGN
 * @returns {Promise<boolean>}
 */
async function hasEnough(userId, amountNGN) {
  const bal = await getBalance(userId);
  return bal >= amountNGN;
}

module.exports = { getBalance, credit, deduct, hasEnough };
