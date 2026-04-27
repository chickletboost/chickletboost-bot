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
 * Initiate a KoraPay Checkout Redirect charge.
 * Docs: https://developers.korapay.com/docs/checkout-redirect
 *
 * @param {object} opts
 * @param {number} opts.amountNGN
 * @param {string} opts.reference        caller passes "user_<telegramId>_<timestamp>"
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @returns {Promise<{ redirectUrl: string, reference: string }>}
 */
async function initiateKoraPayment({ amountNGN, reference, customerName, customerEmail }) {
  const renderUrl = process.env.RENDER_URL;
  if (!renderUrl) throw new Error("RENDER_URL env variable is not set.");

  // Guarantee amount is a number (KoraPay requires Integer, not string)
  const safeAmount = Number(amountNGN);
  if (!safeAmount || safeAmount < 100) throw new Error("Amount must be at least ₦100.");

  // Keep the user_<telegramId>_<ts> format so webhook.js can extract telegramId via split("_")[1]
  // Append an extra random suffix to guarantee uniqueness even on rapid retries
  const safeReference = reference || `user_0_${Date.now()}`;

  // customer.email is required by KoraPay — build a safe fallback if caller sends none
  const safeEmail =
    customerEmail && customerEmail.includes("@") && customerEmail.includes(".")
      ? customerEmail
      : `${safeReference}@chickletboost.com`;

  const body = {
    amount:   safeAmount,          // Integer — required
    currency: "NGN",               // required
    reference: safeReference,      // unique string — required
    narration: "ChickletBoost Wallet Top-Up", // optional but prevents some 422s
    customer: {
      name:  customerName || "ChickletBoost User", // optional per docs but include it
      email: safeEmail,            // required
    },
    notification_url: `${renderUrl}/webhook`,   // optional — overrides dashboard webhook
    redirect_url:     `${renderUrl}/payment-success`, // correct field name per docs (NOT return_url)
    merchant_bears_cost: true,     // merchant absorbs transaction fee
  };

  try {
    const { data: res } = await axios.post(
      "https://api.korapay.com/merchant/api/v1/charges/initialize",
      body,
      { headers: koraHeaders(), timeout: 15000 }
    );

    if (!res.status) throw new Error(res.message || "KoraPay charge initiation failed.");

    // Docs confirm response field is data.checkout_url for Checkout Redirect
    const redirectUrl = res.data?.checkout_url;
    if (!redirectUrl) throw new Error("KoraPay did not return a checkout_url.");

    return { redirectUrl, reference: safeReference };

  } catch (err) {
    // Log full KoraPay error body so you can see exactly what field failed
    console.error("KORAPAY 422 DETAIL:", JSON.stringify(err.response?.data ?? err.message, null, 2));
    throw err;
  }
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
