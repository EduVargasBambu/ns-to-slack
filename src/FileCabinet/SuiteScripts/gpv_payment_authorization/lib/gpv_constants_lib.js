/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Single source of NetSuite IDs and fixed values used by the app.
 */
define([], () => {
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

  const AuditLog = {
    RECORD: 'customrecord_gpv_audit_log',
    PROPOSAL: 'custrecord_gpv_al_proposal',
    LINE: 'custrecord_gpv_al_line',
    LEVEL: 'custrecord_gpv_al_level',
    ACTION: 'custrecord_gpv_al_action',
    EMPLOYEE: 'custrecord_gpv_al_employee',
    CHANNEL: 'custrecord_gpv_al_channel',
    SLACK_USER: 'custrecord_gpv_al_slack_user',
    REASON: 'custrecord_gpv_al_reason',
    IDEMPOTENCY_KEY: 'custrecord_gpv_al_idempotency_key',
  };

  /** Custom lists and the scriptid of each value. Values are resolved to internal IDs at runtime. */
  const ActionList = {
    ID: 'customlist_gpv_action',
    APPROVE: 'val_gpv_approve',
    DISCARD: 'val_gpv_discard',
    UNAUTHORIZED: 'val_gpv_unauthorized',
    CLEAR_LEGACY: 'val_gpv_clear_legacy',
    WEEKLY_EXPIRY: 'val_gpv_weekly_expiry',
  };

  const ChannelList = {
    ID: 'customlist_gpv_channel',
    SLACK: 'val_gpv_slack',
    NETSUITE: 'val_gpv_netsuite',
  };

  return { Config, Secret, AuditLog, ActionList, ChannelList };
});
