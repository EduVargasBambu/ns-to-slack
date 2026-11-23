/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Lines waiting for an employee: pending at a level where they are the approver or
 * the substitute, grouped by proposal and level for the Approval Center.
 */
define([
  'N/search',
  './gpv_constants_lib',
  './gpv_list_lib',
  './gpv_approval_level_lib',
  './gpv_currency_lib',
  './gpv_proposal_lib',
], (
  /** @type {typeof import('N/search')} */ search,
  constants,
  listLib,
  levelLib,
  currencyLib,
  proposalLib,
) => {
  const { Proposal, ProposalLine, LineStatusList } = constants;

  /**
   * @typedef {object} PendingLine
   * @property {string} lineId
   * @property {string} proposalId
   * @property {string} meetingDate As NetSuite formats it for the user.
   * @property {string} levelId
   * @property {string} billId
   * @property {string} billNumber
   * @property {string} vendor
   * @property {number} amount
   * @property {string} currency ISO code.
   * @property {string} dueDate
   */

  /**
   * One group per proposal and level, oldest meeting first, then by level order.
   * Lines inside a group keep the search order (due date).
   * @param {PendingLine[]} lines
   * @param {GpvLevel[]} levels
   */
  const groupLines = (lines, levels) => {
    /** @type {Map<string, { proposalId: string, meetingDate: string, levelId: string, levelName: string, levelOrder: number, lines: PendingLine[] }>} */
    const groups = new Map();
    lines.forEach((line) => {
      const level = levels.find((l) => l.id === line.levelId);
      if (!level) return;
      const key = `${line.proposalId}:${line.levelId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          proposalId: line.proposalId,
          meetingDate: line.meetingDate,
          levelId: level.id,
          levelName: level.name,
          levelOrder: level.order,
          lines: [],
        });
      }
      groups.get(key)?.lines.push(line);
    });
    return [...groups.values()]
      .sort((a, b) => Number(a.proposalId) - Number(b.proposalId) || a.levelOrder - b.levelOrder)
      .map(({ levelOrder: _order, ...group }) => ({
        ...group,
        totals: proposalLib.sumByCurrency(group.lines),
      }));
  };

  /**
   * @param {string} employeeId
   * @returns {ReturnType<typeof groupLines>}
   */
  const findForEmployee = (employeeId) => {
    /** @type {GpvLevel[]} */
    const levels = levelLib.getLevels();
    const mine = levels.filter((l) => [l.approverId, l.substituteId].includes(employeeId));
    if (!employeeId || !mine.length) return [];

    const codes = currencyLib.getCurrencyCodes();
    const meetingDate = search.createColumn({
      name: Proposal.MEETING_DATE,
      join: ProposalLine.PROPOSAL,
    });
    const billNumber = search.createColumn({ name: 'tranid', join: ProposalLine.VENDOR_BILL });
    /** @type {PendingLine[]} */
    const lines = [];
    search
      .create({
        type: ProposalLine.RECORD,
        filters: [
          [
            ProposalLine.STATUS,
            'anyof',
            listLib.getValueId(LineStatusList.ID, LineStatusList.PENDING),
          ],
          'AND',
          [ProposalLine.LEVEL, 'anyof', mine.map((l) => l.id)],
          'AND',
          // The bill join returns one row per transaction line; keep only the main line.
          [`${ProposalLine.VENDOR_BILL}.mainline`, 'is', 'T'],
        ],
        columns: [
          ProposalLine.PROPOSAL,
          meetingDate,
          ProposalLine.LEVEL,
          ProposalLine.VENDOR_BILL,
          billNumber,
          ProposalLine.VENDOR,
          ProposalLine.AMOUNT,
          ProposalLine.CURRENCY,
          search.createColumn({ name: ProposalLine.DUE_DATE, sort: search.Sort.ASC }),
        ],
      })
      .run()
      .each((result) => {
        lines.push({
          lineId: String(result.id),
          proposalId: String(result.getValue(ProposalLine.PROPOSAL)),
          meetingDate: String(result.getValue(meetingDate) || ''),
          levelId: String(result.getValue(ProposalLine.LEVEL)),
          billId: String(result.getValue(ProposalLine.VENDOR_BILL)),
          billNumber: String(result.getValue(billNumber) || ''),
          vendor: String(result.getText(ProposalLine.VENDOR) || ''),
          amount: Number(result.getValue(ProposalLine.AMOUNT)) || 0,
          currency: codes[String(result.getValue(ProposalLine.CURRENCY))] || '',
          dueDate: String(result.getValue(ProposalLine.DUE_DATE) || ''),
        });
        return true;
      });
    return groupLines(lines, levels);
  };

  return { groupLines, findForEmployee };
});
