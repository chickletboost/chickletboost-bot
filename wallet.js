// wallet.js — In-memory user wallet (NGN).
// Balances reset on restart. Swap Map → DB to persist.

const wallets = new Map(); // userId → balance (NGN, float)

function getBalance(userId) {
  if (!wallets.has(userId)) wallets.set(userId, 0);
  return wallets.get(userId);
}

function credit(userId, amount) {
  if (amount <= 0) throw new Error("Credit amount must be positive.");
  const next = round(getBalance(userId) + amount);
  wallets.set(userId, next);
  return next;
}

function deduct(userId, amount) {
  if (amount <= 0) throw new Error("Deduct amount must be positive.");
  const current = getBalance(userId);
  if (current < amount) throw new InsufficientFundsError(current, amount);
  const next = round(current - amount);
  wallets.set(userId, next);
  return next;
}

/** cost = (quantity / 1000) * rate  — returned in the same currency as rate */
function calcCost(rate, quantity) {
  return round((quantity / 1000) * parseFloat(rate));
}

function round(n) {
  return parseFloat(n.toFixed(4));
}

class InsufficientFundsError extends Error {
  constructor(balance, required) {
    super(`Insufficient balance. You have ₦${balance.toFixed(2)} but need ₦${required.toFixed(2)}.`);
    this.name      = "InsufficientFundsError";
    this.balance   = balance;
    this.required  = required;
    this.shortfall = round(required - balance);
  }
}

module.exports = { getBalance, credit, deduct, calcCost, InsufficientFundsError };
