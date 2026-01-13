// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

// --- 1. TYPES DEFINE KAREIN ---
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
  // 2. Configuration Read karein
  const configString = input.shop?.metafield?.value;

  if (!configString) {
    return EMPTY_DISCOUNT;
  }

  // --- 3. FIX: JSON.parse ko Type Assign karein ---
  /** @type {ConfigRule[]} */
  const rules = JSON.parse(configString);

  const discounts = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product.id;
    const quantity = line.quantity;
    const currentPrice = parseFloat(line.cost.amountPerQuantity.amount);

    // Ab TS ko pata hai ki 'r' ek ConfigRule hai
    const rule = rules.find((r) => r.productId === productId);

    if (rule) {
      // Ab TS ko pata hai ki 'a' aur 'b' Tier objects hain
      const sortedTiers = rule.tiers.sort((a, b) => parseInt(b.quantity) - parseInt(a.quantity));
      
      // Ab TS ko pata hai ki 'tier' ek Tier object hai
      const matchingTier = sortedTiers.find((tier) => quantity >= parseInt(tier.quantity));

      if (matchingTier) {
        const targetPrice = parseFloat(matchingTier.price);

        if (targetPrice < currentPrice) {
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