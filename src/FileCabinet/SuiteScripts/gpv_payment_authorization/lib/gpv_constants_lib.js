/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Single source of NetSuite IDs and fixed values used by the app.
 */
define([], () => {
  /** Value of the legacy approval list fields (custbody11/10/9) that means "approved". */
  const LEGACY_APPROVED_VALUE = '1';

  const Config = {
    RECORD: 'customrecord_gpv_config',
    PENDING_SEARCH: 'custrecord_gpv_cfg_pending_search',
    TREASURY_CHANNEL: 'custrecord_gpv_cfg_treasury_channel',
    AP_CHANNEL: 'custrecord_gpv_cfg_ap_channel',
    DISCARD_REASON_REQUIRED: 'custrecord_gpv_cfg_discard_reason_req',
  };

  /** API Secret ids (Setup > Company > API Secrets). Referenced as {id} inside a SecureString. */
  const Secret = {
    SLACK_BOT_TOKEN: 'custsecret_gpv_slack_bot_token',
    SLACK_SIGNING_SECRET: 'custsecret_gpv_slack_signing_secret',
  };

  return { LEGACY_APPROVED_VALUE, Config, Secret };
});
