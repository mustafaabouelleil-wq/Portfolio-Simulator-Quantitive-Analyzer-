module.exports = function(app, yahooFinance, priceCache) {
  // Compatibility patch for yahoo-finance2 on Node < 22
  const originalQuote = yahooFinance.quote.bind(yahooFinance);
  yahooFinance.quote = async function(symbols) {
    try {
      return await originalQuote(symbols, {}, { validateResult: false });
    } catch (e) {
      return await originalQuote(symbols);
    }
  };
};