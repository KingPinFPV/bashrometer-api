// utils/priceCalculator.js

/**
 * Calculates the price per 100 grams for a given product price details.
 * @param {object} priceDetails - Object containing price information.
 * @param {number} priceDetails.regular_price - The regular price.
 * @param {number} [priceDetails.sale_price] - The sale price (optional).
 * @param {string} priceDetails.unit_for_price - The unit for which the price is given (e.g., '100g', 'kg', 'g', 'unit', 'package').
 * @param {number} priceDetails.quantity_for_price - The number of units for which the price is given.
 * @param {number} [priceDetails.default_weight_per_unit_grams] - The default weight in grams if unit_for_price is 'unit' or 'package'.
 * This should come from the product details.
 * @returns {number|null} The calculated price per 100 grams, or null if calculation is not possible.
 */
function calcPricePer100g({ regular_price, sale_price, unit_for_price, quantity_for_price, default_weight_per_unit_grams }) {
  let price = sale_price && sale_price > 0 ? sale_price : regular_price;

  if (!price || !unit_for_price || !quantity_for_price) {
    return null; // Not enough information
  }

  // Ensure numeric types for calculation
  price = parseFloat(price);
  quantity_for_price = parseFloat(quantity_for_price);
  if (default_weight_per_unit_grams) {
    default_weight_per_unit_grams = parseFloat(default_weight_per_unit_grams);
  }

  if (isNaN(price) || isNaN(quantity_for_price) || quantity_for_price <= 0) {
    return null; // Invalid input
  }

  switch (unit_for_price.toLowerCase()) {
    case '100g':
      return price / quantity_for_price;
    case 'kg':
      return (price / quantity_for_price) / 10;
    case 'g':
      // price is for quantity_for_price grams. Price per 1 gram = price / quantity_for_price. Price per 100g = (price / quantity_for_price) * 100
      return (price / quantity_for_price) * 100;
    case 'unit':
    case 'package':
      if (default_weight_per_unit_grams && default_weight_per_unit_grams > 0) {
        const totalWeightInGrams = quantity_for_price * default_weight_per_unit_grams;
        if (totalWeightInGrams === 0) return null;
        return (price / totalWeightInGrams) * 100;
      }
      return null; // Cannot calculate without weight per unit
    default:
      console.warn(`Unknown unit_for_price: ${unit_for_price}`);
      return null; // Unknown unit
  }
}

module.exports = { calcPricePer100g };