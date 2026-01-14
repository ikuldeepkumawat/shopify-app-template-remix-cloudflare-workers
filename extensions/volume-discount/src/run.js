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

// --- HELPER: Currency String ko Cents (Integer) me badalne ke liye ---
// Example: "10.50" -> 1050 cents
/**
 * @param {string} amountString
 */
function toCents(amountString) {
  return Math.round(parseFloat(amountString) * 100);
}

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
  
  // Hum CENTS me total discount calculate karenge taaki math error na ho
  let totalGlobalDiscountCents = 0;
  const allTargets = [];
  
  // Messages collect karne ke liye Set
  const messages = new Set();

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product.id;
    let remainingQty = line.quantity; 
    
    // Price ko Cents me convert karo
    const originalUnitCents = toCents(line.cost.amountPerQuantity.amount);
    
    let lineTargetTotalCents = 0; // Target total bhi Cents me

    // Message Variable
    let highestMatchedTier = null;

    const rule = rules.find((r) => r.productId === productId);

    if (rule) {
      const sortedTiers = rule.tiers.sort((a, b) => parseInt(b.quantity) - parseInt(a.quantity));

      for (const tier of sortedTiers) {
        const tierQty = parseInt(tier.quantity);
        // Tier Price ko Cents me convert karo
        const tierUnitCents = toCents(tier.price);

        if (remainingQty >= tierQty) {
          // Message Logic: Sabse bada tier capture karo
          if (!highestMatchedTier) highestMatchedTier = tier;

          const bundles = Math.floor(remainingQty / tierQty);
          const itemsCovered = bundles * tierQty;

          // Calculation Cents me
          lineTargetTotalCents += itemsCovered * tierUnitCents;
          remainingQty -= itemsCovered;
        }
      }
    }

    // Bache hue items (Original Price in Cents)
    if (remainingQty > 0) {
      lineTargetTotalCents += remainingQty * originalUnitCents;
    }

    // Final Line Calculation in Cents
    const originalLineTotalCents = line.quantity * originalUnitCents;
    
    if (lineTargetTotalCents < originalLineTotalCents) {
      const discountOnLineCents = originalLineTotalCents - lineTargetTotalCents;
      
      // Grand Total me Cents jodo
      totalGlobalDiscountCents += discountOnLineCents;
      allTargets.push({ cartLine: { id: line.id } });

      // --- MESSAGE LOGIC ---
      const messageText = highestMatchedTier 
        ? `Bulk Deal (Qty ${highestMatchedTier.quantity}+)` 
        : `Volume Savings`;
      
      messages.add(messageText);
    }
  }

  if (totalGlobalDiscountCents <= 0) {
    return EMPTY_DISCOUNT;
  }

  // Aakhir me Cents ko wapis Dollars string me convert karo
  const finalDiscountAmount = (totalGlobalDiscountCents / 100).toFixed(2);

  // Messages join karo
  const finalMessage = Array.from(messages).join(" | ");

  return {
    discounts: [
      {
        targets: allTargets,
        value: {
          fixedAmount: {
            amount: finalDiscountAmount
          }
        },
        message: finalMessage
      }
    ],
    discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
  };
}