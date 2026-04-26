// api.js — All calls to the external SMM panel API live here.
// Compatible with PerfectPanel / JustAnotherPanel style APIs.

const axios = require("axios");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

/**
 * Place a new order on the SMM panel.
 * @param {string} serviceId - The panel's internal service ID
 * @param {string} link      - The social media post/profile URL
 * @param {number} quantity  - Number of units to order
 * @returns {Promise<{ orderId: string }>}
 */
async function placeOrder(serviceId, link, quantity) {
  const params = new URLSearchParams({
    key: API_KEY,
    action: "add",
    service: serviceId,
    link,
    quantity: String(quantity),
  });

  const { data } = await axios.post(API_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (data.error) throw new Error(data.error);
  return { orderId: String(data.order) };
}

/**
 * Fetch the status of an existing order.
 * @param {string} orderId - The panel's order ID
 * @returns {Promise<{ status: string, charge: string, startCount: string, remains: string }>}
 */
async function getOrderStatus(orderId) {
  const params = new URLSearchParams({
    key: API_KEY,
    action: "status",
    order: orderId,
  });

  const { data } = await axios.post(API_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (data.error) throw new Error(data.error);

  return {
    status:     data.status     || "Unknown",
    charge:     data.charge     || "N/A",
    startCount: data.start_count|| "N/A",
    remains:    data.remains    || "N/A",
  };
}

module.exports = { placeOrder, getOrderStatus };
