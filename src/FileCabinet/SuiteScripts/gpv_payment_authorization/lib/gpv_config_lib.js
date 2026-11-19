/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Reads the active GPV configuration record.
 */
define(['N/search', 'N/error', './gpv_constants_lib'], (
  /** @type {typeof import('N/search')} */ search,
  /** @type {typeof import('N/error')} */ error,
  constants,
) => {
  const { Config } = constants;

  /**
   * Returns the first active configuration record.
   * @returns {{ pendingSearch: string, treasuryChannel: string, apChannel: string, discardReasonRequired: boolean }}
   * @throws {Error} GPV_CONFIG_NOT_FOUND when there is no active configuration record.
   */
  const getConfig = () => {
    const [result] = search
      .create({
        type: Config.RECORD,
        filters: [['isinactive', 'is', 'F']],
        columns: [
          Config.PENDING_SEARCH,
          Config.TREASURY_CHANNEL,
          Config.AP_CHANNEL,
          Config.DISCARD_REASON_REQUIRED,
        ],
      })
      .run()
      .getRange({ start: 0, end: 1 });

    if (!result) {
      throw error.create({
        name: 'GPV_CONFIG_NOT_FOUND',
        message: 'No hay un registro de Configuración GPV activo.',
      });
    }

    const get = (/** @type {string} */ fieldId) => String(result.getValue(fieldId) || '');
    return {
      pendingSearch: get(Config.PENDING_SEARCH),
      treasuryChannel: get(Config.TREASURY_CHANNEL),
      apChannel: get(Config.AP_CHANNEL),
      discardReasonRequired: result.getValue(Config.DISCARD_REASON_REQUIRED) === true,
    };
  };

  return { getConfig };
});
