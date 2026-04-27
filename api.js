"use strict";

// api.js — External API calls

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

async function fetchServices() {
  const data = await smmPost({ action: "services" });
  if (!Array.isArray(data)) throw new Error("Unexpected response from services API.");
  return data;
}

async function placeOrder(serviceId, link, quantity) {
  const data = await smmPost({
    action: "add",
    service: String(serviceId),
    link,
    quantity: String(quantity),
  });

  if (!data.order) throw new Error("No order ID returned from panel.");
  return { orderId: String(data.order) };
}

async function getOrderStatus(orderId) {
  const data = await smmPost({ action: "status", order: String(orderId) });

  return {
    status: data.status ?? "Unknown",
    charge: data.charge ?? "N/A",
    startCount: data.start_count ?? "N/A",
    remains: data.remains ?? "N/A",
  };
}

// ════════════════════════════════════════════════════════════
// KoraPay FIXED SECTION
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

// ✅ FIXED FUNCTION
async function initiateKoraPayment({ amountNGN, reference, customerName, customerEmail }) {
  const renderUrl = process.env.RENDER_URL;
  if (!renderUrl) throw new Error("RENDER_URL env variable is not set.");

  // ✅ STRICT amount fix
  const safeAmount = Math.floor(Number(amountNGN));
  if (!safeAmount || safeAmount < 100) {
    throw new Error("Invalid amount (must be at least ₦100)");
  }

  // ✅ Unique reference
  const safeReference = `cb_${Date.now()}`;

  // ✅ Always valid email
  const safeEmail = `${safeReference}@chickletboost.com`;

  const body = {
    amount: safeAmount,
    currency: "NGN",
    reference: safeReference,
    customer: {
      name: customerName || "ChickletBoost User",
      email: safeEmail,
    },
    notification_url: `${renderUrl}/webhook`,
    return_url: `${renderUrl}/payment-success`,
  };

  try {
    const { data } = await axios.post(
      `${KORA_BASE}/charges/initialize`,
      body,
      {
        headers: koraHeaders(),
        timeout: 15000,
      }
    );

    console.log("KORAPAY SUCCESS RESPONSE:", data);

    if (!data || !data.status) {
      throw new Error(data?.message || "KoraPay failed");
    }

    const redirectUrl =
      data.data?.checkout_url ||
      data.data?.authorization?.redirect_url;

    if (!redirectUrl) {
      throw new Error("No payment link returned");
    }

    return { redirectUrl, reference: safeReference };

  } catch (err) {
    console.log("🔥 FULL KORAPAY ERROR:", err.response?.data || err.message);
    throw err;
  }
}

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
