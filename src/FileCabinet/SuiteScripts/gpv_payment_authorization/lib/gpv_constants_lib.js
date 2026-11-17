/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Single source of NetSuite IDs and fixed values used by the app.
 */
define([], () => {
  /** Value of the legacy approval list fields (custbody11/10/9) that means "approved". */
  const LEGACY_APPROVED_VALUE = '1';

  return { LEGACY_APPROVED_VALUE };
});
