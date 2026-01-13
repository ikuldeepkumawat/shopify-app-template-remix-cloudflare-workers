// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

/**
 * @typedef {Object} Tier
 * @property {string} quantity
 * @property {string} price
 */

/**
 * @typedef {Object} ConfigRule
 * @property {string} productId
 * @property {Tier[]} tiers
 */

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  // Logs for Debugging
  console.error("Function Input:", JSON.stringify(input));

  const configString = input.shop?.metafield?.value;

  if (!configString) {
    console.error("Metafield not found");
    return EMPTY_DISCOUNT;
  }

  /** @type {ConfigRule[]} */
  const rules = JSON.parse(configString);
  console.error("Rules Parsed:", JSON.stringify(rules));

  const discounts = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product.id;
    const quantity = line.quantity;
    const currentPrice = parseFloat(line.cost.amountPerQuantity.amount);

    // --- YE LINE MISSING THI ---
    // Pehle rule dhundo, phir use karo
    const rule = rules.find((r) => r.productId === productId);

    if (rule) {
      console.error(`Checking Product ${productId} with Qty ${quantity}`);

      const sortedTiers = rule.tiers.sort((a, b) => parseInt(b.quantity) - parseInt(a.quantity));
      const matchingTier = sortedTiers.find((tier) => quantity >= parseInt(tier.quantity));

      if (matchingTier) {
        const targetPrice = parseFloat(matchingTier.price);

        if (targetPrice < currentPrice) {
          console.error(`Applying Discount: ${currentPrice} -> ${targetPrice}`);
          
          const discountPerUnit = currentPrice - targetPrice;

          discounts.push({
            targets: [{ cartLine: { id: line.id } }],
            value: {
              fixedAmount: {
                amount: discountPerUnit.toString()
              }
            },
            message: `Bulk Deal (Qty ${matchingTier.quantity}+)`
          });
        }
      }
    }
  }

  return {
    discounts: discounts,
    discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
  };
}