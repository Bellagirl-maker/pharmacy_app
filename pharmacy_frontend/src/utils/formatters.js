
/**
 * Formats a number or string into Ghanaian Cedi (GH₵) currency format.
 * @param {number|string} amount - The numerical value to format.
 * @returns {string} e.g. "GH₵ 15.00"
 */
export const formatCurrency = (amount) => {
  const numericAmount = Number(amount) || 0;
  return `GH₵ ${numericAmount.toFixed(2)}`;
};