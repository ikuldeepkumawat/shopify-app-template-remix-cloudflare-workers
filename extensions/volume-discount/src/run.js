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
  const configString = input.shop?.metafield?.value;

  if (!configString) {
    return EMPTY_DISCOUNT;
  }

  /** @type {ConfigRule[]} */
  const rules = JSON.parse(configString);
  const discounts = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product.id;
    let remainingQty = line.quantity; 
    const originalUnitPrice = parseFloat(line.cost.amountPerQuantity.amount);
    
    // Final Target Price calculate karenge
    let targetTotalPrice = 0;
    
    // Message ke liye variable: Sabse bada tier kaunsa laga?
    let highestMatchedTier = null;

    const rule = rules.find((r) => r.productId === productId);

    if (rule) {
      // 1. Tiers ko BADE se CHHOTE kram me sort karo
      const sortedTiers = rule.tiers.sort((a, b) => parseInt(b.quantity) - parseInt(a.quantity));

      // 2. Bucket Logic
      for (const tier of sortedTiers) {
        const tierQty = parseInt(tier.quantity);
        const tierUnitPrice = parseFloat(tier.price);

        if (remainingQty >= tierQty) {
          // Agar ye pehla (sabse bada) tier match hua hai, to ise message ke liye save kar lo
          if (!highestMatchedTier) {
            highestMatchedTier = tier;
          }

          const bundles = Math.floor(remainingQty / tierQty);
          const itemsCovered = bundles * tierQty;

          targetTotalPrice += itemsCovered * tierUnitPrice;
          remainingQty -= itemsCovered;
        }
      }
    }

    // 3. Bache hue items ko ORIGINAL price par jodo
    if (remainingQty > 0) {
      targetTotalPrice += remainingQty * originalUnitPrice;
    }

    // 4. Discount Amount Nikalo
    const originalTotalPrice = line.quantity * originalUnitPrice;

    if (targetTotalPrice < originalTotalPrice) {
      const totalDiscountAmount = originalTotalPrice - targetTotalPrice;

      // Message Logic: Agar koi tier match hua to uska Qty dikhao, nahi to Generic message
      const messageText = highestMatchedTier 
        ? `Bulk Deal (Qty ${highestMatchedTier.quantity}+)` 
        : `Volume Savings`;

      discounts.push({
        targets: [{ cartLine: { id: line.id } }],
        value: {
          fixedAmount: {
            amount: totalDiscountAmount.toFixed(2)
          }
        },
        message: messageText // <--- YAHAN CHANGE KIYA HAI
      });
    }
  }

  return {
    discounts: discounts,
    discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
  };
}