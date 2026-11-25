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
  '../lib/gpv_link_token_lib',
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
  linkToken,
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

  /** Absolute URL of the external deployment (no NetSuite login), already a full URL. */
  const getExternalUrl = () =>
    url.resolveScript({
      scriptId: ApprovalCenter.SCRIPT,
      deploymentId: ApprovalCenter.EXTERNAL_DEPLOYMENT,
      returnExternalUrl: true,
    });

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
   * Levels approved by external link also notify the substitute (no NetSuite session to rely on).
   * shortcut: substitutes of internal levels are not notified; add them if the approver is often away.
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
          .flatMap((l) => [l.approverId, l.externalLink ? l.substituteId : ''])
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
        const external = approvalLib.isExternalLinkEmployee(levels, employeeId);
        const dm = messages.buildApproverDm(
          pendingLines.findForEmployee(employeeId),
          external
            ? `${getExternalUrl()}&t=${encodeURIComponent(linkToken.create({ employeeId }))}`
            : centerUrl,
          external ? 'Revisar y autorizar' : undefined,
        );
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
   * Weekly reminder: DMs every approver who has anything pending, in any open proposal.
   * @returns {number} DMs sent.
   */
  const notifyAllApprovers = () =>
    notifyLevels(levelLib.getLevels().map((/** @type {GpvLevel} */ l) => l.id));

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
   * Confirms by DM to the approver what they just approved and where it went.
   * @param {string} employeeId Who approved.
   * @param {{ lineId: string, outcome: string, nextLevelId?: string|null }[]} results
   * @returns {boolean} Whether the DM was sent.
   */
  const notifyApprover = (employeeId, results) => {
    const approved = results.filter(
      (r) => r.outcome === Outcome.ADVANCED || r.outcome === Outcome.AUTHORIZED,
    );
    if (!approved.length) return false;
    try {
      const slackUser = getSlackUserId(employeeId);
      if (!slackUser) return false;
      /** @type {Map<string, number>} next level id -> lines */
      const moved = new Map();
      approved
        .filter((r) => r.outcome === Outcome.ADVANCED)
        .forEach((r) => {
          const id = String(r.nextLevelId || '');
          moved.set(id, (moved.get(id) || 0) + 1);
        });
      /** @type {GpvLevel[]} */
      const levels = levelLib.getLevels();
      const text = messages.buildApprovalConfirmation({
        lines: pendingLines.findByIds(approved.map((r) => String(r.lineId))),
        nextLevels: levels
          .filter((l) => moved.has(l.id))
          .map((l) => ({ levelName: l.name, count: moved.get(l.id) || 0 })),
        authorizedCount: approved.filter((r) => r.outcome === Outcome.AUTHORIZED).length,
      });
      if (!text) return false;
      slackClient.postMessage(slackUser, text);
      return true;
    } catch (e) {
      log.error(
        TITLE,
        `Confirmación al empleado ${employeeId}: ${/** @type {Error} */ (e).message}`,
      );
      return false;
    }
  };

  /**
   * Tells the AP channel which bills were discarded, by whom and why.
   * @param {string[]} lineIds Lines just discarded.
   * @param {string} employeeName
   * @param {string} reason
   * @returns {boolean} Whether the notice was posted.
   */
  const notifyDiscarded = (lineIds, employeeName, reason) => {
    if (!lineIds.length) return false;
    try {
      const { apChannel } = configLib.getConfig();
      if (!apChannel) {
        log.audit(TITLE, 'Falta el Canal de Slack de CXP; no se avisó del descarte.');
        return false;
      }
      const text = messages.buildDiscardNotice({
        lines: pendingLines.findByIds(lineIds.map(String)),
        employeeName,
        reason,
      });
      if (!text) return false;
      slackClient.postMessage(apChannel, text);
      return true;
    } catch (e) {
      log.error(TITLE, `Aviso de descarte a CXP: ${/** @type {Error} */ (e).message}`);
      return false;
    }
  };

  /**
   * Notices that follow an approve or discard: confirmation to the approver, next approvers,
   * treasury and, for discards, the AP channel.
   * @param {{ lineId: string, outcome: string, nextLevelId?: string|null }[]} results
   * @param {{ employeeId: string, employeeName: string, reason?: string }} actor
   */
  const notifyAfterAction = (results, { employeeId, employeeName, reason = '' }) => {
    notifyApprover(employeeId, results);
    notifyLevels(
      results.filter((r) => r.outcome === Outcome.ADVANCED).map((r) => String(r.nextLevelId || '')),
    );
    notifyTreasury(results.filter((r) => r.outcome === Outcome.AUTHORIZED).map((r) => r.lineId));
    notifyDiscarded(
      results.filter((r) => r.outcome === Outcome.DISCARDED).map((r) => r.lineId),
      employeeName,
      reason,
    );
  };

  return {
    notifyLevels,
    notifyAllApprovers,
    notifyTreasury,
    notifyApprover,
    notifyDiscarded,
    notifyAfterAction,
  };
});
