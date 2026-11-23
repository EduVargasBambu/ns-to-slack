import record from 'N/record';
import search from 'N/search';
import auditLog from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_audit_log_lib';
import expiry from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_expiry_service_lib';

jest.mock('N/record', () => ({ submitFields: jest.fn(), Type: { VENDOR_BILL: 'vendorbill' } }));
jest.mock('N/search', () => ({ create: jest.fn() }));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));
jest.mock('../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_list_lib', () => ({
  getValueId: (_listId, valueScriptId) => valueScriptId,
}));
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_audit_log_lib',
  () => ({
    AuditAction: { WEEKLY_EXPIRY: 'WEEKLY_EXPIRY' },
    AuditChannel: { NETSUITE: 'NETSUITE' },
    buildIdempotencyKey: (line, level, action) => `${line}:${level}:${action}`,
    write: jest.fn(),
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_level_lib',
  () => ({
    getLevels: () => [
      { id: '11', name: 'Director', order: 1, approvalField: 'custbody_gpv_dir_approval' },
      { id: '12', name: 'CFO', order: 2, approvalField: 'custbody_gpv_cfo_approval' },
    ],
  }),
);

/** Pending lines and open proposals returned by the two searches. */
const givenSearch = ({ lines, proposals }) =>
  search.create.mockImplementation(({ type }) => {
    const rows =
      type === 'customrecord_gpv_proposal_line'
        ? lines.map((l) => ({
            id: l.id,
            getValue: (field) =>
              ({
                custrecord_gpv_pl_proposal: l.proposalId,
                custrecord_gpv_pl_vendor_bill: l.billId,
                custrecord_gpv_pl_level: l.levelId,
              })[field],
          }))
        : proposals.map((id) => ({ id }));
    return {
      run: () => ({
        each: (cb) => {
          rows.every((row) => cb(row) !== false);
        },
      }),
    };
  });

/** Calls to record.submitFields and the audit log, in order. */
const calls = () => {
  const order = [];
  record.submitFields.mockImplementation(({ type, id, values }) =>
    order.push({ kind: 'update', type, id, values }),
  );
  auditLog.write.mockImplementation((entry) => order.push({ kind: 'audit', entry }));
  return order;
};

beforeEach(() => jest.clearAllMocks());

describe('expirePendingLines', () => {
  it('updates the bill, logs and expires the line, then closes open proposals', () => {
    givenSearch({
      lines: [{ id: '7', proposalId: '3', billId: '500', levelId: '12' }],
      proposals: ['3'],
    });
    const order = calls();

    expect(expiry.expirePendingLines({ hasBudget: () => true })).toEqual({
      done: true,
      expiredCount: 1,
      closedCount: 1,
    });
    expect(order).toEqual([
      {
        kind: 'update',
        type: 'vendorbill',
        id: '500',
        values: {
          custbody_gpv_authorization_status: 'val_gpv_expired',
          custbody_gpv_dir_approval: false,
          custbody_gpv_cfo_approval: false,
        },
      },
      {
        kind: 'audit',
        entry: {
          action: 'WEEKLY_EXPIRY',
          channel: 'NETSUITE',
          proposalId: '3',
          lineId: '7',
          levelId: '12',
          idempotencyKey: '7:12:WEEKLY_EXPIRY',
        },
      },
      {
        kind: 'update',
        type: 'customrecord_gpv_proposal_line',
        id: '7',
        values: { custrecord_gpv_pl_status: 'val_gpv_expired', custrecord_gpv_pl_level: '' },
      },
      {
        kind: 'update',
        type: 'customrecord_gpv_payment_proposal',
        id: '3',
        values: { custrecord_gpv_pp_status: 'val_gpv_closed' },
      },
    ]);
  });

  it('expires a line without level instead of leaving its bill stuck', () => {
    givenSearch({
      lines: [{ id: '8', proposalId: '3', billId: '501', levelId: '' }],
      proposals: [],
    });
    const order = calls();

    expiry.expirePendingLines({ hasBudget: () => true });
    expect(order.find((c) => c.kind === 'audit').entry.levelId).toBeUndefined();
    expect(order.at(-1).values).toEqual({
      custrecord_gpv_pl_status: 'val_gpv_expired',
      custrecord_gpv_pl_level: '',
    });
  });

  it('stops without closing proposals when the budget runs out', () => {
    givenSearch({
      lines: [
        { id: '7', proposalId: '3', billId: '500', levelId: '11' },
        { id: '8', proposalId: '3', billId: '501', levelId: '11' },
      ],
      proposals: ['3'],
    });
    const order = calls();
    let budget = 1;

    expect(expiry.expirePendingLines({ hasBudget: () => budget-- > 0 })).toEqual({
      done: false,
      expiredCount: 1,
      closedCount: 0,
    });
    expect(order.some((c) => c.type === 'customrecord_gpv_payment_proposal')).toBe(false);
  });
});
