"use strict";

// wallet.js — Persistent wallet backed by PostgreSQL

const { query } = require("./db");

function round(n) {
  return Math.round(n * 100) / 100;
}

async function getBalance(userId) {
  // Ensure row exists
  await query(
    `INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING;`,
    [userId]
  );
  const res = await query(
    `SELECT balance FROM wallets WHERE user_id = $1;`,
    [userId]
  );
  return parseFloat(res.rows[0]?.balance ?? 0);
}

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

async function hasEnough(userId, amountNGN) {
  const bal = await getBalance(userId);
  return bal >= amountNGN;
}

module.exports = { getBalance, credit, deduct, hasEnough };
