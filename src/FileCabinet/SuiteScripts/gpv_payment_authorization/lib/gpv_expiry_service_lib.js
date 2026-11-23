/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Weekly expiry: pending lines become expired, their bills go back to the pending
 * pool with every approval checkbox cleared, and open proposals are closed.
 * Resumable: each line leaves the search once expired; proposals close only when none is left.
 */
define([
  'N/search',
  'N/record',
  './gpv_constants_lib',
  './gpv_list_lib',
  './gpv_audit_log_lib',
  './gpv_approval_level_lib',
  './gpv_line_state_machine_lib',
], (
  /** @type {typeof import('N/search')} */ search,
  /** @type {typeof import('N/record')} */ record,
  constants,
  listLib,
  auditLog,
  levelLib,
  stateMachine,
) => {
  const { Proposal, ProposalLine, VendorBill, ProposalStatusList, LineStatusList } = constants;
  const { LineStatus } = stateMachine;
  const { AuditAction, AuditChannel } = auditLog;

  const lineStatusId = (/** @type {string} */ status) =>
    listLib.getValueId(LineStatusList.ID, LineStatusList[status]);
  const proposalStatusId = (/** @type {string} */ status) =>
    listLib.getValueId(ProposalStatusList.ID, ProposalStatusList[status]);

  /**
   * Expires one line. The bill is updated first: if the run stops halfway, the line is still
   * pending and the next run repeats the bill update (same values) and the audit (idempotent).
   * Expiry does not go through applyAction on purpose: a line whose level was misconfigured
   * must still expire, or its bill would stay out of every future proposal.
   * @param {{ id: string, proposalId: string, billId: string, levelId: string }} line
   * @param {GpvLevel[]} levels
   */
  const expireLine = (line, levels) => {
    const expiredId = lineStatusId(LineStatus.EXPIRED);

    /** @type {Record<string, any>} */
    const billValues = { [VendorBill.AUTHORIZATION_STATUS]: expiredId };
    levels.forEach((level) => {
      billValues[level.approvalField] = false;
    });
    record.submitFields({
      type: record.Type.VENDOR_BILL,
      id: line.billId,
      values: billValues,
      options: { ignoreMandatoryFields: true },
    });

    auditLog.write({
      action: AuditAction.WEEKLY_EXPIRY,
      channel: AuditChannel.NETSUITE,
      proposalId: line.proposalId,
      lineId: line.id,
      levelId: line.levelId || undefined,
      idempotencyKey: auditLog.buildIdempotencyKey(
        line.id,
        line.levelId,
        AuditAction.WEEKLY_EXPIRY,
      ),
    });

    record.submitFields({
      type: ProposalLine.RECORD,
      id: line.id,
      values: { [ProposalLine.STATUS]: expiredId, [ProposalLine.LEVEL]: '' },
    });
  };

  /** @returns {number} Proposals closed. */
  const closeOpenProposals = () => {
    const openId = proposalStatusId('OPEN');
    const closedId = proposalStatusId('CLOSED');
    let closed = 0;
    search
      .create({ type: Proposal.RECORD, filters: [[Proposal.STATUS, 'anyof', openId]] })
      .run()
      .each((result) => {
        record.submitFields({
          type: Proposal.RECORD,
          id: result.id,
          values: { [Proposal.STATUS]: closedId },
        });
        closed += 1;
        return true;
      });
    return closed;
  };

  /**
   * @param {object} options
   * @param {() => boolean} options.hasBudget False when the run must stop and reschedule.
   * @returns {{ done: boolean, expiredCount: number, closedCount: number }}
   */
  const expirePendingLines = ({ hasBudget }) => {
    const levels = levelLib.getLevels();
    let done = true;
    let expiredCount = 0;

    search
      .create({
        type: ProposalLine.RECORD,
        filters: [[ProposalLine.STATUS, 'anyof', lineStatusId(LineStatus.PENDING)]],
        columns: [ProposalLine.PROPOSAL, ProposalLine.VENDOR_BILL, ProposalLine.LEVEL],
      })
      .run()
      .each((result) => {
        if (!hasBudget()) {
          done = false;
          return false;
        }
        expireLine(
          {
            id: String(result.id),
            proposalId: String(result.getValue(ProposalLine.PROPOSAL)),
            billId: String(result.getValue(ProposalLine.VENDOR_BILL)),
            levelId: String(result.getValue(ProposalLine.LEVEL) || ''),
          },
          levels,
        );
        expiredCount += 1;
        return true;
      });

    return { done, expiredCount, closedCount: done ? closeOpenProposals() : 0 };
  };

  return { expirePendingLines };
});
