/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @description Smoke test: resolves a list value by scriptid and posts "Hola desde NetSuite" to treasury.
 */
define([
  'N/error',
  '../lib/gpv_config_lib',
  '../lib/gpv_constants_lib',
  '../lib/gpv_list_lib',
  '../slack/gpv_slack_client_lib',
], (/** @type {typeof import('N/error')} */ error, configLib, constants, listLib, slackClient) => {
  const TITLE = 'gpv_slack_smoke_test_ss';

  const execute = () => {
    // Checks that list values resolve by scriptid in this account (needed by the audit log).
    const { ActionList } = constants;
    log.audit(TITLE, `val_gpv_approve -> ${listLib.getValueId(ActionList.ID, ActionList.APPROVE)}`);

    const { treasuryChannel } = configLib.getConfig();
    if (!treasuryChannel) {
      throw error.create({
        name: 'GPV_CONFIG_MISSING_CHANNEL',
        message: 'Falta el Canal de Slack de Tesorería en la Configuración GPV.',
      });
    }

    const result = slackClient.postMessage(treasuryChannel, 'Hola desde NetSuite :wave:');
    log.audit(TITLE, `Mensaje enviado. channel=${result.channel} ts=${result.ts}`);
  };

  return { execute };
});
