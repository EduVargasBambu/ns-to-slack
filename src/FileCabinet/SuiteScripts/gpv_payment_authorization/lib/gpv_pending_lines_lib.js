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
  const { Proposal, ProposalLine, LineStatusList, Vendor, VendorPriorityList } = constants;
  /** Currencies shown first, in this order; any other goes after them, alphabetically. */
  const CURRENCY_ORDER = ['USD', 'MXN'];

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
   * @property {number} priorityRank 0 = Alto, 1 = Medio, 2 = Bajo, 3 = no priority.
   * @property {string} priority Vendor priority as the list shows it; '' when none.
   * @property {string} billDate Bill transaction date, as NetSuite formats it.
   * @property {string} memo Bill memo; '' when none.
   * @property {string} subsidiary Bill subsidiary, short name (last segment); '' when none.
   * @property {string} vendorDescription Vendor description; '' when none.
   */

  /**
   * NetSuite returns hierarchical names ("Parent : Child"); only the last segment is shown.
   * @param {string} name
   * @returns {string}
   */
  const shortSubsidiaryName = (name) => name.split(':').pop()?.trim() ?? '';

  /**
   * Bill order inside a group: subsidiary (A-Z, none last), then vendor priority (Alto → Bajo, unclassified last), then USD before
   * MXN, then amount high to low. Ties keep the search order (due date).
   * @param {PendingLine[]} lines
   * @returns {PendingLine[]} New sorted array.
   */
  const sortLines = (lines) => {
    const currencyRank = (/** @type {string} */ code) => {
      const i = CURRENCY_ORDER.indexOf(code);
      return i === -1 ? CURRENCY_ORDER.length : i;
    };
    return [...lines].sort(
      (a, b) =>
        Number(!a.subsidiary) - Number(!b.subsidiary) ||
        a.subsidiary.localeCompare(b.subsidiary, 'es') ||
        a.priorityRank - b.priorityRank ||
        currencyRank(a.currency) - currencyRank(b.currency) ||
        a.currency.localeCompare(b.currency) ||
        b.amount - a.amount,
    );
  };

  /** @returns {Record<string, number>} Priority value internal id -> rank. */
  const getPriorityRanks = () =>
    Object.fromEntries(
      [VendorPriorityList.HIGH, VendorPriorityList.MEDIUM, VendorPriorityList.LOW].map((v, i) => [
        listLib.getValueId(VendorPriorityList.ID, v),
        i,
      ]),
    );

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
        lines: sortLines(group.lines),
        totals: proposalLib.sumByCurrency(group.lines),
      }));
  };

  /**
   * Proposal lines with what a person needs to recognize the bill.
   * @param {any[]} filters Filter expression on the proposal line.
   * @returns {PendingLine[]} Ordered by due date.
   */
  const searchLines = (filters) => {
    const codes = currencyLib.getCurrencyCodes();
    const meetingDate = search.createColumn({
      name: Proposal.MEETING_DATE,
      join: ProposalLine.PROPOSAL,
    });
    const billNumber = search.createColumn({ name: 'tranid', join: ProposalLine.VENDOR_BILL });
    const priority = search.createColumn({ name: Vendor.PRIORITY, join: ProposalLine.VENDOR });
    const subsidiary = search.createColumn({ name: 'subsidiary', join: ProposalLine.VENDOR_BILL });
    const billDate = search.createColumn({ name: 'trandate', join: ProposalLine.VENDOR_BILL });
    const memo = search.createColumn({ name: 'memo', join: ProposalLine.VENDOR_BILL });
    const vendorDescription = search.createColumn({
      name: Vendor.DESCRIPTION,
      join: ProposalLine.VENDOR,
    });
    const ranks = getPriorityRanks();
    const NO_PRIORITY = 3;
    /** @type {PendingLine[]} */
    const lines = [];
    search
      .create({
        type: ProposalLine.RECORD,
        filters: [
          ...filters,
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
          priority,
          vendorDescription,
          subsidiary,
          billDate,
          memo,
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
          levelId: String(result.getValue(ProposalLine.LEVEL) || ''),
          billId: String(result.getValue(ProposalLine.VENDOR_BILL)),
          billNumber: String(result.getValue(billNumber) || ''),
          vendor: String(result.getText(ProposalLine.VENDOR) || ''),
          amount: Number(result.getValue(ProposalLine.AMOUNT)) || 0,
          currency: codes[String(result.getValue(ProposalLine.CURRENCY))] || '',
          dueDate: String(result.getValue(ProposalLine.DUE_DATE) || ''),
          priorityRank: ranks[String(result.getValue(priority))] ?? NO_PRIORITY,
          priority: String(result.getText(priority) || ''),
          billDate: String(result.getValue(billDate) || ''),
          memo: String(result.getValue(memo) || ''),
          subsidiary: shortSubsidiaryName(String(result.getText(subsidiary) || '')),
          vendorDescription: String(result.getValue(vendorDescription) || ''),
        });
        return true;
      });
    return lines;
  };

  /**
   * @param {string[]} lineIds
   * @returns {PendingLine[]}
   */
  const findByIds = (lineIds) =>
    lineIds.length ? searchLines([['internalid', 'anyof', lineIds]]) : [];

  /**
   * @param {string} employeeId
   * @returns {ReturnType<typeof groupLines>}
   */
  const findForEmployee = (employeeId) => {
    /** @type {GpvLevel[]} */
    const levels = levelLib.getLevels();
    const mine = levels.filter((l) => [l.approverId, l.substituteId].includes(employeeId));
    if (!employeeId || !mine.length) return [];

    return groupLines(
      searchLines([
        [
          ProposalLine.STATUS,
          'anyof',
          listLib.getValueId(LineStatusList.ID, LineStatusList.PENDING),
        ],
        'AND',
        [ProposalLine.LEVEL, 'anyof', mine.map((l) => l.id)],
      ]),
      levels,
    );
  };

  /**
   * One group per proposal, oldest meeting first, for the treasury view.
   * @param {PendingLine[]} lines
   */
  const groupByProposal = (lines) => {
    /** @type {Map<string, { proposalId: string, meetingDate: string, lines: PendingLine[] }>} */
    const groups = new Map();
    lines.forEach((line) => {
      if (!groups.has(line.proposalId)) {
        groups.set(line.proposalId, {
          proposalId: line.proposalId,
          meetingDate: line.meetingDate,
          lines: [],
        });
      }
      groups.get(line.proposalId)?.lines.push(line);
    });
    return [...groups.values()]
      .sort((a, b) => Number(a.proposalId) - Number(b.proposalId))
      .map((group) => ({
        ...group,
        lines: sortLines(group.lines),
        totals: proposalLib.sumByCurrency(group.lines),
      }));
  };

  /**
   * Authorized lines whose bill is still open (not paid in full), for treasury.
   * @returns {ReturnType<typeof groupByProposal>}
   */
  const findAuthorized = () =>
    groupByProposal(
      searchLines([
        [
          ProposalLine.STATUS,
          'anyof',
          listLib.getValueId(LineStatusList.ID, LineStatusList.AUTHORIZED),
        ],
        'AND',
        // VendBill:A = Open; a partial payment keeps it open, paid in full drops it.
        [`${ProposalLine.VENDOR_BILL}.status`, 'anyof', 'VendBill:A'],
      ]),
    );

  return {
    shortSubsidiaryName,
    sortLines,
    groupLines,
    groupByProposal,
    findForEmployee,
    findByIds,
    findAuthorized,
  };
});
