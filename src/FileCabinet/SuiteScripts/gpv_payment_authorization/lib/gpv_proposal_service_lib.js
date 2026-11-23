/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Builds the weekly payment proposal from the pending bills search.
 * Resumable: each bill leaves the search as soon as its line exists, so a run cut short by
 * governance continues in the same proposal (one proposal per meeting date).
 */
define([
  'N/search',
  'N/record',
  'N/file',
  'N/format',
  './gpv_constants_lib',
  './gpv_list_lib',
  './gpv_audit_log_lib',
  './gpv_approval_level_lib',
  './gpv_proposal_lib',
  './gpv_line_state_machine_lib',
], (
  /** @type {typeof import('N/search')} */ search,
  /** @type {typeof import('N/record')} */ record,
  /** @type {typeof import('N/file')} */ file,
  /** @type {typeof import('N/format')} */ format,
  constants,
  listLib,
  auditLog,
  levelLib,
  proposalLib,
  stateMachine,
) => {
  const { Proposal, ProposalLine, VendorBill, ProposalStatusList, LineStatusList } = constants;
  const { LineStatus } = stateMachine;
  const { AuditAction, AuditChannel } = auditLog;

  const lineStatusId = (/** @type {string} */ status) =>
    listLib.getValueId(LineStatusList.ID, LineStatusList[status]);

  const toDateText = (/** @type {Date} */ date) =>
    String(format.format({ value: date, type: format.Type.DATE }));

  /** @returns {string|null} */
  const findProposal = (/** @type {Date} */ meetingDate) => {
    const [result] = search
      .create({
        type: Proposal.RECORD,
        filters: [
          [Proposal.MEETING_DATE, 'on', toDateText(meetingDate)],
          'AND',
          ['isinactive', 'is', 'F'],
        ],
      })
      .run()
      .getRange({ start: 0, end: 1 });
    return result ? String(result.id) : null;
  };

  const createProposal = (/** @type {Date} */ meetingDate) => {
    const rec = record.create({ type: Proposal.RECORD });
    rec.setValue({ fieldId: Proposal.MEETING_DATE, value: meetingDate });
    rec.setValue({
      fieldId: Proposal.STATUS,
      value: listLib.getValueId(ProposalStatusList.ID, ProposalStatusList.OPEN),
    });
    return String(rec.save());
  };

  /**
   * The client's search plus the app's filters and columns. Its own columns stay first (CSV).
   * @param {string} searchId
   * @param {GpvLevel[]} levels
   */
  const loadPendingSearch = (searchId, levels) => {
    const pending = search.load({ id: searchId });
    // Bills outside an active proposal: never in one, or discarded or expired from one.
    const available = [
      VendorBill.AUTHORIZATION_STATUS,
      'anyof',
      ['@NONE@', lineStatusId(LineStatus.DISCARDED), lineStatusId(LineStatus.EXPIRED)],
    ];
    const own = pending.filterExpression;
    pending.filterExpression = [
      ...(own.length ? [own, 'AND'] : []),
      ['mainline', 'is', 'T'],
      'AND',
      available,
    ];
    pending.columns = [
      ...pending.columns,
      'entity',
      'fxamount',
      'currency',
      'duedate',
      ...levels.map((level) => level.approvalField),
    ];
    return pending;
  };

  /**
   * Creates the line for one bill, marks the bill and clears out-of-order approvals.
   * shortcut: a crash between the line save and the bill update leaves a duplicate line on the
   * next run; add a per-bill existence check if it ever shows up.
   * @param {string} proposalId
   * @param {import('N/search').Result} result Row of the pending search.
   * @param {GpvLevel[]} levels
   */
  const addBill = (proposalId, result, levels) => {
    const approvals = Object.fromEntries(
      levels.map((level) => [level.approvalField, result.getValue(level.approvalField)]),
    );
    const line = proposalLib.buildLine(approvals, levels);
    const dueDate = String(result.getValue('duedate') || '');

    const rec = record.create({ type: ProposalLine.RECORD });
    /** @type {Record<string, any>} */
    const values = {
      [ProposalLine.PROPOSAL]: proposalId,
      [ProposalLine.VENDOR_BILL]: result.id,
      [ProposalLine.VENDOR]: result.getValue('entity'),
      // Bill amounts can come signed from the search; the line keeps the amount to pay.
      [ProposalLine.AMOUNT]: Math.abs(Number(result.getValue('fxamount')) || 0),
      [ProposalLine.CURRENCY]: result.getValue('currency'),
      [ProposalLine.DUE_DATE]: dueDate
        ? format.parse({ value: dueDate, type: format.Type.DATE })
        : null,
      [ProposalLine.STATUS]: lineStatusId(line.status),
      [ProposalLine.LEVEL]: line.level ? line.level.id : null,
    };
    Object.entries(values).forEach(([fieldId, value]) => {
      if (value !== null && value !== '') rec.setValue({ fieldId, value });
    });
    const lineId = String(rec.save());

    /** @type {Record<string, any>} */
    const billValues = { [VendorBill.AUTHORIZATION_STATUS]: lineStatusId(line.status) };
    line.levelsToClear.forEach((/** @type {GpvLevel} */ level) => {
      billValues[level.approvalField] = false;
    });
    record.submitFields({
      type: record.Type.VENDOR_BILL,
      id: result.id,
      values: billValues,
      options: { ignoreMandatoryFields: true },
    });

    if (line.levelsToClear.length) {
      auditLog.writeMany(
        line.levelsToClear.map((/** @type {GpvLevel} */ level) => ({
          action: AuditAction.CLEAR_LEGACY,
          channel: AuditChannel.NETSUITE,
          proposalId,
          lineId,
          levelId: level.id,
          idempotencyKey: auditLog.buildIdempotencyKey(lineId, level.id, AuditAction.CLEAR_LEGACY),
        })),
      );
    }
  };

  /** @returns {Record<string, string>} Currency internal id -> ISO code (MXN, USD...). */
  const getCurrencyCodes = () => {
    /** @type {Record<string, string>} */
    const codes = {};
    search
      .create({ type: search.Type.CURRENCY, columns: ['symbol'] })
      .run()
      .each((result) => {
        codes[String(result.id)] = String(result.getValue('symbol'));
        return true;
      });
    return codes;
  };

  /** @param {string} proposalId */
  const getLines = (proposalId) => {
    /** @type {{ billId: string, amount: number, currencyId: string, statusId: string, levelId: string }[]} */
    const lines = [];
    search
      .create({
        type: ProposalLine.RECORD,
        filters: [[ProposalLine.PROPOSAL, 'anyof', proposalId]],
        columns: [
          ProposalLine.VENDOR_BILL,
          ProposalLine.AMOUNT,
          ProposalLine.CURRENCY,
          ProposalLine.STATUS,
          ProposalLine.LEVEL,
        ],
      })
      .run()
      .each((result) => {
        lines.push({
          billId: String(result.getValue(ProposalLine.VENDOR_BILL)),
          amount: Number(result.getValue(ProposalLine.AMOUNT)) || 0,
          currencyId: String(result.getValue(ProposalLine.CURRENCY)),
          statusId: String(result.getValue(ProposalLine.STATUS)),
          levelId: String(result.getValue(ProposalLine.LEVEL)),
        });
        return true;
      });
    return lines;
  };

  /**
   * Writes the CSV with the client's search columns for the proposal's bills.
   * @param {string} searchId
   * @param {string[]} billIds
   * @param {Date} meetingDate
   * @returns {string} File id.
   */
  const saveCsv = (searchId, billIds, meetingDate) => {
    const bills = search.load({ id: searchId });
    const columns = /** @type {import('N/search').Column[]} */ (bills.columns);
    // Only the client's columns; its filters are replaced so every bill in the proposal shows up.
    bills.filterExpression = [['mainline', 'is', 'T'], 'AND', ['internalid', 'anyof', billIds]];
    /** @type {unknown[][]} */
    const rows = [];
    bills.run().each((result) => {
      rows.push(columns.map((column) => result.getText(column) || result.getValue(column)));
      return true;
    });

    const folder = file.load({ id: constants.PROPOSAL_FOLDER_MARKER }).folder;
    // Local date parts: toISOString() is UTC and can move the date a day.
    const isoDate = [
      meetingDate.getFullYear(),
      String(meetingDate.getMonth() + 1).padStart(2, '0'),
      String(meetingDate.getDate()).padStart(2, '0'),
    ].join('-');
    return String(
      file
        .create({
          name: `concentrado_${isoDate}.csv`,
          fileType: file.Type.CSV,
          contents: proposalLib.toCsv(
            columns.map((column) => column.label || column.name),
            rows,
          ),
          folder,
        })
        .save(),
    );
  };

  /**
   * Totals, CSV and summary of the whole proposal (lines from every run).
   * @param {string} proposalId
   * @param {string} searchId
   * @param {GpvLevel[]} levels
   * @param {Date} meetingDate
   */
  const finalize = (proposalId, searchId, levels, meetingDate) => {
    const lines = getLines(proposalId);
    const codes = getCurrencyCodes();
    const pendingId = lineStatusId(LineStatus.PENDING);
    const authorizedId = lineStatusId(LineStatus.AUTHORIZED);

    const totals = proposalLib.sumByCurrency(
      lines.map((line) => ({
        amount: line.amount,
        currency: codes[line.currencyId] || line.currencyId,
      })),
    );
    const fileId = saveCsv(
      searchId,
      lines.map((line) => line.billId),
      meetingDate,
    );
    record.submitFields({
      type: Proposal.RECORD,
      id: proposalId,
      // shortcut: the record only has MXN and USD totals; other currencies show only in Slack.
      values: {
        [Proposal.TOTAL_MXN]: totals.MXN || 0,
        [Proposal.TOTAL_USD]: totals.USD || 0,
        [Proposal.FILE]: fileId,
      },
    });

    return {
      billCount: lines.length,
      totals,
      pendingByLevel: levels.map((level) => ({
        name: level.name,
        count: lines.filter((line) => line.statusId === pendingId && line.levelId === level.id)
          .length,
      })),
      authorizedCount: lines.filter((line) => line.statusId === authorizedId).length,
    };
  };

  /**
   * Creates (or continues) the proposal for a meeting date.
   * @param {object} options
   * @param {Date} options.meetingDate
   * @param {string} options.searchId Pending bills saved search.
   * @param {() => boolean} options.hasBudget False when the run must stop and reschedule.
   * @returns {{ done: boolean, proposalId: string|null, summary: ReturnType<typeof finalize>|null }}
   *   summary is null while not done; billCount 0 when there was nothing to propose.
   */
  const generateWeeklyProposal = ({ meetingDate, searchId, hasBudget }) => {
    const levels = levelLib.getLevels();
    let proposalId = findProposal(meetingDate);
    let done = true;
    const seen = new Set();

    loadPendingSearch(searchId, levels)
      .run()
      .each((result) => {
        if (!hasBudget()) {
          done = false;
          return false;
        }
        if (seen.has(result.id)) return true;
        seen.add(result.id);
        proposalId = proposalId || createProposal(meetingDate);
        addBill(proposalId, result, levels);
        return true;
      });

    if (!done) return { done, proposalId, summary: null };
    if (!proposalId) {
      return {
        done,
        proposalId,
        summary: { billCount: 0, totals: {}, pendingByLevel: [], authorizedCount: 0 },
      };
    }
    return { done, proposalId, summary: finalize(proposalId, searchId, levels, meetingDate) };
  };

  return { generateWeeklyProposal };
});
