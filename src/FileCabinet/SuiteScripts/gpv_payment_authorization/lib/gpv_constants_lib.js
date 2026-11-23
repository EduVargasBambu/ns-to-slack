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

  const ApprovalLevel = {
    RECORD: 'customrecord_gpv_approval_level',
    ORDER: 'custrecord_gpv_lvl_order',
    APPROVER: 'custrecord_gpv_lvl_approver',
    SUBSTITUTE: 'custrecord_gpv_lvl_substitute',
    /** Bill checkbox (custbody_gpv_*_approval) that records this level's approval. */
    APPROVAL_FIELD: 'custrecord_gpv_lvl_legacy_field',
  };

  const Proposal = {
    RECORD: 'customrecord_gpv_payment_proposal',
    MEETING_DATE: 'custrecord_gpv_pp_meeting_date',
    STATUS: 'custrecord_gpv_pp_status',
    TOTAL_MXN: 'custrecord_gpv_pp_total_mxn',
    TOTAL_USD: 'custrecord_gpv_pp_total_usd',
    FILE: 'custrecord_gpv_pp_excel_file',
  };

  const ProposalLine = {
    RECORD: 'customrecord_gpv_proposal_line',
    PROPOSAL: 'custrecord_gpv_pl_proposal',
    VENDOR_BILL: 'custrecord_gpv_pl_vendor_bill',
    VENDOR: 'custrecord_gpv_pl_vendor',
    AMOUNT: 'custrecord_gpv_pl_amount',
    CURRENCY: 'custrecord_gpv_pl_currency',
    DUE_DATE: 'custrecord_gpv_pl_due_date',
    STATUS: 'custrecord_gpv_pl_status',
    LEVEL: 'custrecord_gpv_pl_level',
    DISCARD_REASON: 'custrecord_gpv_pl_discard_reason',
    DISCARDED_BY: 'custrecord_gpv_pl_discarded_by',
  };

  const VendorBill = {
    AUTHORIZATION_STATUS: 'custbody_gpv_authorization_status',
  };

  /** File Cabinet folder for the proposal CSV files; resolved through a placeholder file. */
  const PROPOSAL_FOLDER_MARKER = '/SuiteScripts/gpv_payment_authorization/proposals/README.txt';

  /** Custom lists and the scriptid of each value. Values are resolved to internal IDs at runtime. */
  const ProposalStatusList = {
    ID: 'customlist_gpv_proposal_status',
    OPEN: 'val_gpv_open',
    CLOSED: 'val_gpv_closed',
    CANCELLED: 'val_gpv_cancelled',
  };

  /** Keys match LineStatus in gpv_line_state_machine_lib. */
  const LineStatusList = {
    ID: 'customlist_gpv_line_status',
    PENDING: 'val_gpv_pending',
    AUTHORIZED: 'val_gpv_authorized',
    DISCARDED: 'val_gpv_discarded',
    PAID: 'val_gpv_paid',
    EXPIRED: 'val_gpv_expired',
  };

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

  return {
    Config,
    Secret,
    AuditLog,
    ApprovalLevel,
    Proposal,
    ProposalLine,
    VendorBill,
    PROPOSAL_FOLDER_MARKER,
    ProposalStatusList,
    LineStatusList,
    ActionList,
    ChannelList,
  };
});
