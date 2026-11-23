/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Currency internal ids to ISO codes (internal ids differ per account).
 */
define(['N/search'], (/** @type {typeof import('N/search')} */ search) => {
  /** @returns {Record<string, string>} Currency internal id -> ISO code (MXN, USD...). */
  const getCurrencyCodes = () => {
    /** @type {Record<string, string>} */
    const codes = {};
    search
      .create({ type: search.Type.CURRENCY, columns: ['symbol'] })
      .run()
      .each((result) => {
        codes[String(result.id)] = String(result.getValue('symbol'));
        return true;
      });
    return codes;
  };

  return { getCurrencyCodes };
});
