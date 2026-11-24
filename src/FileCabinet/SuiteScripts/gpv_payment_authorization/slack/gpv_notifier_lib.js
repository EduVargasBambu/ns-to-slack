/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Slack notices: DM to the approvers who have bills waiting and a notice to the
 * treasury channel when bills are authorized. A failed notice is logged and never undoes or
 * blocks the approval that caused it.
 * Governance: ~50 units per approver DM, ~40 for the treasury notice.
 */
define([
  'N/url',
  'N/search',
  '../lib/gpv_constants_lib',
  '../lib/gpv_config_lib',
  '../lib/gpv_approval_level_lib',
  '../lib/gpv_pending_lines_lib',
  '../lib/gpv_approval_lib',
  './gpv_slack_client_lib',
  './gpv_notification_message_lib',
], (
  /** @type {typeof import('N/url')} */ url,
  /** @type {typeof import('N/search')} */ search,
  constants,
  configLib,
  levelLib,
  pendingLines,
  approvalLib,
  slackClient,
  messages,
) => {
  const TITLE = 'gpv_notifier_lib';
  const { Employee, ApprovalCenter } = constants;
  const { Outcome } = approvalLib;

  /**
   * Absolute URL of the Approval Center (users open it with their session).
   * @param {Record<string, string>} [params] e.g. { view: 'authorized' } for the treasury view.
   * @returns {string}
   */
  const getCenterUrl = (params) =>
    `https://${url.resolveDomain({ hostType: url.HostType.APPLICATION })}${url.resolveScript({
      scriptId: ApprovalCenter.SCRIPT,
      deploymentId: ApprovalCenter.DEPLOYMENT,
      returnExternalUrl: false,
      params,
    })}`;

  /** @param {string} employeeId */
  const getSlackUserId = (employeeId) => {
    const fields = search.lookupFields({
      type: search.Type.EMPLOYEE,
      id: employeeId,
      columns: [Employee.SLACK_USER],
    });
    return String(fields[Employee.SLACK_USER] || '').trim();
  };

  /**
   * DMs the approver of each level once, with everything waiting for them.
   * shortcut: substitutes are not notified; add them if a level's approver is often away.
   * @param {string[]} levelIds Levels that just got bills.
   * @returns {number} DMs sent.
   */
  const notifyLevels = (levelIds) => {
    const wanted = new Set(levelIds.filter(Boolean).map(String));
    if (!wanted.size) return 0;
    /** @type {GpvLevel[]} */
    const levels = levelLib.getLevels();
    const approverIds = [
      ...new Set(
        levels
          .filter((l) => wanted.has(l.id))
          .map((l) => l.approverId)
          .filter(Boolean),
      ),
    ];
    if (!approverIds.length) return 0;

    const centerUrl = getCenterUrl();
    let sent = 0;
    approverIds.forEach((employeeId) => {
      try {
        const slackUser = getSlackUserId(employeeId);
        if (!slackUser) {
          log.audit(TITLE, `El empleado ${employeeId} no tiene Usuario de Slack; no se le avisó.`);
          return;
        }
        const dm = messages.buildApproverDm(pendingLines.findForEmployee(employeeId), centerUrl);
        if (!dm) return;
        slackClient.call('chat.postMessage', { channel: slackUser, ...dm });
        sent += 1;
      } catch (e) {
        log.error(TITLE, `DM al empleado ${employeeId}: ${/** @type {Error} */ (e).message}`);
      }
    });
    return sent;
  };

  /**
   * Tells treasury how many bills were authorized, with a button to the authorized view.
   * @param {string[]} lineIds Lines that just became authorized.
   * @returns {boolean} Whether the notice was posted.
   */
  const notifyTreasury = (lineIds) => {
    if (!lineIds.length) return false;
    try {
      const { treasuryChannel } = configLib.getConfig();
      if (!treasuryChannel) {
        log.audit(TITLE, 'Falta el Canal de Slack de Tesorería; no se avisó.');
        return false;
      }
      const notice = messages.buildTreasuryMessage(
        pendingLines.findByIds(lineIds.map(String)),
        getCenterUrl({ view: 'authorized' }),
      );
      if (!notice) return false;
      slackClient.call('chat.postMessage', { channel: treasuryChannel, ...notice });
      return true;
    } catch (e) {
      log.error(TITLE, `Aviso a Tesorería: ${/** @type {Error} */ (e).message}`);
      return false;
    }
  };

  /**
   * Notices that follow an approve or discard: next approvers and treasury.
   * @param {{ lineId: string, outcome: string, nextLevelId?: string|null }[]} results
   */
  const notifyAfterAction = (results) => {
    notifyLevels(
      results.filter((r) => r.outcome === Outcome.ADVANCED).map((r) => String(r.nextLevelId || '')),
    );
    notifyTreasury(results.filter((r) => r.outcome === Outcome.AUTHORIZED).map((r) => r.lineId));
  };

  return { notifyLevels, notifyTreasury, notifyAfterAction };
});
