"use strict";

// api.js — External API calls
//
// SMM Panel : ChickletBoost PerfectPanel  (API_URL env var)
// Payments  : KoraPay                     (KORA_SECRET_KEY env var)

const axios = require("axios");

// ════════════════════════════════════════════════════════════
// SMM Panel (PerfectPanel / ChickletBoost)
// ════════════════════════════════════════════════════════════

function smmUrl() {
  if (!process.env.API_URL) throw new Error("API_URL env variable is not set.");
  return process.env.API_URL;
}

function smmKey() {
  if (!process.env.API_KEY) throw new Error("API_KEY env variable is not set.");
  return process.env.API_KEY;
}

async function smmPost(params) {
  const body = new URLSearchParams({ key: smmKey(), ...params });
  const { data } = await axios.post(smmUrl(), body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });
  if (data && data.error) throw new Error(data.error);
  return data;
}

/**
 * Fetch all available services from PerfectPanel.
 * @returns {Promise<object[]>}
 */
async function fetchServices() {
  const data = await smmPost({ action: "services" });
  if (!Array.isArray(data)) throw new Error("Unexpected response from services API.");
  return data;
}

/**
 * Place a new order.
 * @param {string|number} serviceId
 * @param {string}        link
 * @param {number}        quantity
 * @returns {Promise<{ orderId: string }>}
 */
async function placeOrder(serviceId, link, quantity) {
  const data = await smmPost({
    action:   "add",
    service:  String(serviceId),
    link,
    quantity: String(quantity),
  });
  if (!data.order) throw new Error("No order ID returned from panel.");
  return { orderId: String(data.order) };
}

/**
 * Fetch order status from PerfectPanel.
 * @param {string|number} orderId
 * @returns {Promise<{ status, charge, startCount, remains }>}
 */
async function getOrderStatus(orderId) {
  const data = await smmPost({ action: "status", order: String(orderId) });
  return {
    status:     data.status      ?? "Unknown",
    charge:     data.charge      ?? "N/A",
    startCount: data.start_count ?? "N/A",
    remains:    data.remains     ?? "N/A",
  };
}

// ════════════════════════════════════════════════════════════
// KoraPay
// ════════════════════════════════════════════════════════════

const KORA_BASE = "https://api.korapay.com/merchant/api/v1";

function koraHeaders() {
  if (!process.env.KORA_SECRET_KEY)
    throw new Error("KORA_SECRET_KEY env variable is not set.");
  return {
    Authorization: `Bearer ${process.env.KORA_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Initiate a KoraPay Pay-with-Bank charge.
 *
 * @param {object} opts
 * @param {number} opts.amountNGN
 * @param {string} opts.reference        "user_<telegramId>_<timestamp>"
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @returns {Promise<{ redirectUrl: string, reference: string }>}
 */
async function initiateKoraPayment({ amountNGN, reference, customerName, customerEmail }) {
  const renderUrl = process.env.RENDER_URL;
  if (!renderUrl) throw new Error("RENDER_URL env variable is not set.");

  const body = {
    amount: Number(amountNGN), // ✅ FIX: ensure number
    currency: "NGN",
    reference,
    customer: {
      name: customerName || "ChickletBoost User", // ✅ FIX: fallback name
      email: customerEmail || `${reference}@chickletboost.com`, // ✅ FIX: valid fallback email
    },
    notification_url: `${renderUrl}/webhook`,
    return_url:       `${renderUrl}/payment-success`,
  };

  const { data: res } = await axios.post(
    `${KORA_BASE}/charges/initialize`,
    body,
    { headers: koraHeaders(), timeout: 15000 }
  );

  if (!res.status) throw new Error(res.message || "KoraPay charge initiation failed.");

  const redirectUrl =
    res.data?.checkout_url ??
    res.data?.authorization?.redirect_url;

  if (!redirectUrl) throw new Error("KoraPay did not return a payment URL.");

  return { redirectUrl, reference };
}

/**
 * Re-verify a transaction status from KoraPay.
 * Always call this before crediting a wallet.
 * @param {string} reference
 * @returns {Promise<{ status: string, amount: number }>}
 */
async function verifyKoraPayment(reference) {
  const { data: res } = await axios.get(
    `${KORA_BASE}/charges/${encodeURIComponent(reference)}`,
    { headers: koraHeaders(), timeout: 15000 }
  );
  if (!res.status) throw new Error(res.message || "KoraPay verification failed.");
  return {
    status: res.data?.status ?? "unknown",
    amount: res.data?.amount ?? 0,
  };
}

module.exports = {
  fetchServices,
  placeOrder,
  getOrderStatus,
  initiateKoraPayment,
  verifyKoraPayment,
};
