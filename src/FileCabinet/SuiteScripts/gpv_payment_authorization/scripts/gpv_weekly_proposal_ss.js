/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @description Monday job: builds the weekly payment proposal and posts its summary to the AP channel.
 * Can be run by hand: a second run on the same day continues the same proposal.
 */
define([
  'N/runtime',
  'N/task',
  'N/format',
  'N/error',
  '../lib/gpv_config_lib',
  '../lib/gpv_proposal_service_lib',
  '../slack/gpv_slack_client_lib',
  '../slack/gpv_proposal_message_lib',
], (
  /** @type {typeof import('N/runtime')} */ runtime,
  /** @type {typeof import('N/task')} */ task,
  /** @type {typeof import('N/format')} */ format,
  /** @type {typeof import('N/error')} */ error,
  configLib,
  proposalService,
  slackClient,
  proposalMessage,
) => {
  const TITLE = 'gpv_weekly_proposal_ss';
  /** Units kept for the final step (totals, CSV, Slack) after the last bill. */
  const RESERVED_USAGE = 500;

  /** @param {string} message */
  const configError = (message) => error.create({ name: 'GPV_CONFIG_INCOMPLETE', message });

  const execute = () => {
    const script = runtime.getCurrentScript();
    const { pendingSearch, apChannel } = configLib.getConfig();
    if (!pendingSearch)
      throw configError('Falta la Búsqueda de pendientes en la Configuración GPV.');
    if (!apChannel) throw configError('Falta el Canal de Slack de CXP en la Configuración GPV.');

    // shortcut: a rescheduled run that starts after midnight opens a new proposal for the new
    // date; pass the meeting date as a script parameter if runs ever get that long.
    const meetingDate = new Date();
    const result = proposalService.generateWeeklyProposal({
      meetingDate,
      searchId: pendingSearch,
      hasBudget: () => script.getRemainingUsage() > RESERVED_USAGE,
    });

    if (!result.done || !result.summary) {
      const taskId = task
        .create({
          taskType: task.TaskType.SCHEDULED_SCRIPT,
          scriptId: script.id,
          deploymentId: script.deploymentId,
        })
        .submit();
      log.audit(
        TITLE,
        `Concentrado ${result.proposalId} incompleto; continúa en la tarea ${taskId}.`,
      );
      return;
    }

    const text = proposalMessage.buildProposalSummary({
      meetingDate: String(format.format({ value: meetingDate, type: format.Type.DATE })),
      ...result.summary,
    });
    const posted = slackClient.postMessage(apChannel, text);
    log.audit(
      TITLE,
      `Concentrado ${result.proposalId}: ${result.summary.billCount} facturas. Slack ts=${posted.ts}`,
    );
  };

  return { execute };
});
