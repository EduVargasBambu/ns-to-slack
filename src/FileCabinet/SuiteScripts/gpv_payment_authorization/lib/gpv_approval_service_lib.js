/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Approves or discards proposal lines. Same core for every channel (NetSuite, Slack).
 * Each line is written bill -> audit -> line: a retry after a cut finishes the job (same bill
 * values, idempotent audit) and a repeated click finds the line no longer pending.
 * Governance: ~30 units per line. Callers pass hasBudget so a big batch stops cleanly and
 * reports the rest as NOT_PROCESSED instead of being cut by NetSuite halfway.
 */
define([
  'N/search',
  'N/record',
  'N/error',
  './gpv_constants_lib',
  './gpv_list_lib',
  './gpv_config_lib',
  './gpv_audit_log_lib',
  './gpv_approval_level_lib',
  './gpv_approval_lib',
  './gpv_line_state_machine_lib',
], (
  /** @type {typeof import('N/search')} */ search,
  /** @type {typeof import('N/record')} */ record,
  /** @type {typeof import('N/error')} */ error,
  constants,
  listLib,
  configLib,
  auditLog,
  levelLib,
  approvalLib,
  stateMachine,
) => {
  const { ProposalLine, VendorBill, LineStatusList } = constants;
  const { LineStatus, LineAction } = stateMachine;
  const { Outcome } = approvalLib;
  const { AuditAction } = auditLog;

  const lineStatusId = (/** @type {string} */ status) =>
    listLib.getValueId(LineStatusList.ID, LineStatusList[status]);

  /**
   * @param {string[]} lineIds
   * @returns {Record<string, { proposalId: string, billId: string, status: string, levelId: string }>}
   */
  const loadLines = (lineIds) => {
    /** @type {Record<string, string>} list internal id -> LineStatus */
    const statusById = Object.fromEntries(
      Object.values(LineStatus).map((status) => [lineStatusId(status), status]),
    );
    /** @type {Record<string, any>} */
    const lines = {};
    search
      .create({
        type: ProposalLine.RECORD,
        filters: [['internalid', 'anyof', lineIds]],
        columns: [
          ProposalLine.PROPOSAL,
          ProposalLine.VENDOR_BILL,
          ProposalLine.STATUS,
          ProposalLine.LEVEL,
        ],
      })
      .run()
      .each((result) => {
        lines[String(result.id)] = {
          proposalId: String(result.getValue(ProposalLine.PROPOSAL)),
          billId: String(result.getValue(ProposalLine.VENDOR_BILL)),
          status: statusById[String(result.getValue(ProposalLine.STATUS))] || '',
          levelId: String(result.getValue(ProposalLine.LEVEL) || ''),
        };
        return true;
      });
    return lines;
  };

  /**
   * @typedef {object} LineResult
   * @property {string} lineId
   * @property {string} outcome One of approvalLib.Outcome.
   * @property {string} [billId]
   * @property {string} [proposalId]
   * @property {string|null} [nextLevelId] Level now waiting (ADVANCED), to notify its approver.
   */

  /**
   * @param {object} options
   * @param {string} options.action LineAction.APPROVE or LineAction.DISCARD.
   * @param {Array<string|number>} options.lineIds
   * @param {string|number} options.employeeId Authenticated employee, never taken from the request.
   * @param {string} options.channel auditLog.AuditChannel.
   * @param {string} [options.slackUserId]
   * @param {string} [options.reason] Discard reason.
   * @param {() => boolean} [options.hasBudget] Checked before each line; false stops the batch.
   * @returns {LineResult[]} One result per requested line, same order.
   * @throws {Error} GPV_DISCARD_REASON_REQUIRED
   */
  const act = ({
    action,
    lineIds,
    employeeId,
    channel,
    slackUserId,
    reason = '',
    hasBudget = () => true,
  }) => {
    const discarding = action === LineAction.DISCARD;
    if (discarding && !reason.trim() && configLib.getConfig().discardReasonRequired) {
      throw error.create({
        name: 'GPV_DISCARD_REASON_REQUIRED',
        message: 'Escribe el motivo del descarte.',
      });
    }
    const ids = [...new Set(lineIds.map(String))];
    if (!ids.length) return [];

    const levels = levelLib.getLevels();
    const lines = loadLines(ids);
    const auditAction = discarding ? AuditAction.DISCARD : AuditAction.APPROVE;

    let stopped = false;
    return ids.map((lineId) => {
      // Once the budget runs out every remaining line is reported, none is half-written.
      stopped = stopped || !hasBudget();
      if (stopped) return { lineId, outcome: Outcome.NOT_PROCESSED };

      const line = lines[lineId];
      if (!line) return { lineId, outcome: Outcome.NOT_PENDING };

      const plan = approvalLib.planLineAction({
        line,
        levels,
        employeeId: String(employeeId),
        action,
      });
      const base = { lineId, billId: line.billId, proposalId: line.proposalId };
      const entry = {
        channel,
        slackUserId,
        proposalId: line.proposalId,
        lineId,
        levelId: line.levelId || undefined,
        employeeId: employeeId || undefined,
      };

      if (plan.outcome === Outcome.UNAUTHORIZED) {
        // No idempotency key: every attempt is evidence.
        auditLog.write({ ...entry, action: AuditAction.UNAUTHORIZED });
        return { ...base, outcome: plan.outcome };
      }
      if (plan.outcome === Outcome.NOT_PENDING || !plan.next) {
        return { ...base, outcome: Outcome.NOT_PENDING };
      }

      /** @type {Record<string, any>} */
      const billValues = { ...plan.checkboxes };
      if (plan.billStatus)
        billValues[VendorBill.AUTHORIZATION_STATUS] = lineStatusId(plan.billStatus);
      record.submitFields({
        type: record.Type.VENDOR_BILL,
        id: line.billId,
        values: billValues,
        options: { ignoreMandatoryFields: true },
      });

      auditLog.write({
        ...entry,
        action: auditAction,
        reason: discarding ? reason.trim() : undefined,
        idempotencyKey: auditLog.buildIdempotencyKey(lineId, line.levelId, auditAction),
      });

      /** @type {Record<string, any>} */
      const lineValues = {
        [ProposalLine.STATUS]: lineStatusId(plan.next.status),
        [ProposalLine.LEVEL]: plan.next.level ? plan.next.level.id : '',
      };
      if (discarding) {
        lineValues[ProposalLine.DISCARD_REASON] = reason.trim();
        lineValues[ProposalLine.DISCARDED_BY] = String(employeeId);
      }
      record.submitFields({ type: ProposalLine.RECORD, id: lineId, values: lineValues });

      return {
        ...base,
        outcome: plan.outcome,
        nextLevelId: plan.next.level ? plan.next.level.id : null,
      };
    });
  };

  /**
   * Approves lines at the level each one waits for.
   * @param {{ lineIds: Array<string|number>, employeeId: string|number, channel: string, slackUserId?: string, hasBudget?: () => boolean }} options
   * @returns {LineResult[]}
   */
  const approve = (options) => act({ ...options, action: LineAction.APPROVE });

  /**
   * Discards lines: the bills go back to the pending pool and start over at level 1.
   * @param {{ lineIds: Array<string|number>, employeeId: string|number, channel: string, slackUserId?: string, reason?: string, hasBudget?: () => boolean }} options
   * @returns {LineResult[]}
   * @throws {Error} GPV_DISCARD_REASON_REQUIRED
   */
  const discard = (options) => act({ ...options, action: LineAction.DISCARD });

  return { approve, discard };
});
