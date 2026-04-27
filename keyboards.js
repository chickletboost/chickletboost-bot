// keyboards.js — All inline keyboard builders in one place.

const { Markup } = require("telegraf");
const services = require("./services");

/** Main menu shown after /start */
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback("🚀 Start Growth", "start_growth")],
  [
    Markup.button.callback("💳 Add Funds", "add_funds"),
    Markup.button.callback("📦 Check Order", "check_order"),
  ],
  [Markup.button.callback("💬 Support", "support")],
]);

/** Platform selection (Instagram / TikTok / YouTube) */
const platformMenu = Markup.inlineKeyboard([
  ...Object.entries(services).map(([key, val]) => [
    Markup.button.callback(val.label, `platform_${key}`),
  ]),
  [Markup.button.callback("🔙 Back", "back_main")],
]);

/** Service type buttons for a given platform */
function serviceMenu(platformKey) {
  const platform = services[platformKey];
  const buttons = Object.entries(platform.services).map(([key, val]) => [
    Markup.button.callback(val.label, `service_${platformKey}_${key}`),
  ]);
  buttons.push([Markup.button.callback("🔙 Back", "start_growth")]);
  return Markup.inlineKeyboard(buttons);
}

/** Package buttons for a given platform + service type */
function packageMenu(platformKey, serviceKey) {
  const packages = services[platformKey].services[serviceKey].packages;
  const buttons = packages.map((pkg, idx) => [
    Markup.button.callback(
      `${pkg.label} — ${pkg.price}`,
      `pkg_${platformKey}_${serviceKey}_${idx}`
    ),
  ]);
  buttons.push([Markup.button.callback("🔙 Back", `platform_${platformKey}`)]);
  return Markup.inlineKeyboard(buttons);
}

module.exports = { mainMenu, platformMenu, serviceMenu, packageMenu };
