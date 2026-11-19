/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @description Outbound smoke test: posts "Hola desde NetSuite" to the treasury channel.
 */
define(['N/error', '../lib/gpv_config_lib', '../slack/gpv_slack_client_lib'], (
  /** @type {typeof import('N/error')} */ error,
  configLib,
  slackClient,
) => {
  const TITLE = 'gpv_slack_smoke_test_ss';

  const execute = () => {
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
