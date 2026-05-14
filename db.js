"use strict";

// db.js — PostgreSQL connection + auto table creation

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id   BIGINT PRIMARY KEY,
      balance   NUMERIC(12, 2) NOT NULL DEFAULT 0
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tracked_orders (
      order_id    TEXT PRIMARY KEY,
      user_id     BIGINT NOT NULL,
      cost        NUMERIC(12, 2) NOT NULL,
      quantity    INTEGER NOT NULL,
      name        TEXT NOT NULL,
      placed_at   BIGINT NOT NULL,
      notified    BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS processed_payments (
      reference    TEXT PRIMARY KEY,
      telegram_id  BIGINT NOT NULL,
      amount       NUMERIC(12, 2) NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id     BIGINT PRIMARY KEY,
      username    TEXT,
      first_name  TEXT,
      joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("[DB] Tables ready.");
}

module.exports = { query, initDB };
