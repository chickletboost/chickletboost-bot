"use strict";

// db.js — PostgreSQL connection + auto table creation
//
// Uses the DATABASE_URL environment variable set on Render.
// Tables are created automatically on startup if they don't exist.

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Render Postgres
});

/**
 * Run a query against the database.
 * @param {string} text
 * @param {any[]}  params
 */
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Create all required tables if they don't already exist.
 * Call this once at startup before the bot launches.
 */
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

  console.log("[DB] Tables ready.");
}

module.exports = { query, initDB };
