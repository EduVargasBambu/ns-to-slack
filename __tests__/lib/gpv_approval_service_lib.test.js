import record from 'N/record';
import search from 'N/search';
import auditLog from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_audit_log_lib';
import configLib from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_config_lib';
import service from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_service_lib';

jest.mock('N/record', () => ({ submitFields: jest.fn(), Type: { VENDOR_BILL: 'vendorbill' } }));
jest.mock('N/search', () => ({ create: jest.fn() }));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));
// List value ids are their scriptids, so statuses read back as 'val_gpv_pending', etc.
jest.mock('../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_list_lib', () => ({
  getValueId: (_listId, valueScriptId) => valueScriptId,
}));
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_config_lib',
  () => ({
    getConfig: jest.fn(),
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_audit_log_lib',
  () => ({
    AuditAction: { APPROVE: 'APPROVE', DISCARD: 'DISCARD', UNAUTHORIZED: 'UNAUTHORIZED' },
    buildIdempotencyKey: (line, level, action) => `${line}:${level}:${action}`,
    write: jest.fn(),
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_level_lib',
  () => ({
    getLevels: () => [
      {
        id: '11',
        name: 'Director',
        order: 1,
        approvalField: 'custbody_gpv_dir_approval',
        approverId: '100',
        substituteId: '',
      },
      {
        id: '12',
        name: 'CFO',
        order: 2,
        approvalField: 'custbody_gpv_cfo_approval',
        approverId: '200',
        substituteId: '',
      },
    ],
  }),
);

/** Proposal lines returned by the line search. */
const givenLines = (lines) =>
  search.create.mockReturnValue({
    run: () => ({
      each: (cb) =>
        lines.forEach((l) =>
          cb({
            id: l.id,
            getValue: (field) =>
              ({
                custrecord_gpv_pl_proposal: '3',
                custrecord_gpv_pl_vendor_bill: l.billId,
                custrecord_gpv_pl_status: l.status,
                custrecord_gpv_pl_level: l.levelId,
              })[field],
          }),
        ),
    }),
  });

let order;
beforeEach(() => {
  jest.clearAllMocks();
  order = [];
  record.submitFields.mockImplementation(({ type, id, values }) =>
    order.push({ kind: 'update', type, id, values }),
  );
  auditLog.write.mockImplementation((entry) => order.push({ kind: 'audit', entry }));
  configLib.getConfig.mockReturnValue({ discardReasonRequired: true });
});

describe('approve', () => {
  it('writes bill, audit and line in that order and returns the next level', () => {
    givenLines([{ id: '7', billId: '500', status: 'val_gpv_pending', levelId: '11' }]);

    expect(service.approve({ lineIds: ['7'], employeeId: '100', channel: 'NETSUITE' })).toEqual([
      { lineId: '7', billId: '500', proposalId: '3', outcome: 'ADVANCED', nextLevelId: '12' },
    ]);
    expect(order).toEqual([
      {
        kind: 'update',
        type: 'vendorbill',
        id: '500',
        values: { custbody_gpv_dir_approval: true },
      },
      {
        kind: 'audit',
        entry: expect.objectContaining({
          action: 'APPROVE',
          employeeId: '100',
          levelId: '11',
          idempotencyKey: '7:11:APPROVE',
        }),
      },
      {
        kind: 'update',
        type: 'customrecord_gpv_proposal_line',
        id: '7',
        values: { custrecord_gpv_pl_status: 'val_gpv_pending', custrecord_gpv_pl_level: '12' },
      },
    ]);
  });

  it('marks the bill authorized at the last level', () => {
    givenLines([{ id: '7', billId: '500', status: 'val_gpv_pending', levelId: '12' }]);

    const [result] = service.approve({ lineIds: ['7'], employeeId: '200', channel: 'NETSUITE' });
    expect(result.outcome).toBe('AUTHORIZED');
    expect(order[0].values).toEqual({
      custbody_gpv_cfo_approval: true,
      custbody_gpv_authorization_status: 'val_gpv_authorized',
    });
  });

  it('only logs an unauthorized attempt', () => {
    givenLines([{ id: '7', billId: '500', status: 'val_gpv_pending', levelId: '11' }]);

    const [result] = service.approve({ lineIds: ['7'], employeeId: '200', channel: 'SLACK' });
    expect(result.outcome).toBe('UNAUTHORIZED');
    expect(order).toEqual([
      {
        kind: 'audit',
        entry: expect.objectContaining({ action: 'UNAUTHORIZED', employeeId: '200' }),
      },
    ]);
    expect(order[0].entry.idempotencyKey).toBeUndefined();
  });

  it('does nothing on a repeated click or an unknown line', () => {
    givenLines([{ id: '7', billId: '500', status: 'val_gpv_authorized', levelId: '' }]);

    expect(
      service.approve({ lineIds: ['7', '8', '7'], employeeId: '200', channel: 'NETSUITE' }),
    ).toEqual([
      { lineId: '7', billId: '500', proposalId: '3', outcome: 'NOT_PENDING' },
      { lineId: '8', outcome: 'NOT_PENDING' },
    ]);
    expect(order).toEqual([]);
  });
});

describe('budget', () => {
  it('stops cleanly and reports the remaining lines as not processed', () => {
    givenLines([
      { id: '7', billId: '500', status: 'val_gpv_pending', levelId: '11' },
      { id: '8', billId: '501', status: 'val_gpv_pending', levelId: '11' },
      { id: '9', billId: '502', status: 'val_gpv_pending', levelId: '11' },
    ]);
    let budget = 1;

    const results = service.approve({
      lineIds: ['7', '8', '9'],
      employeeId: '100',
      channel: 'NETSUITE',
      hasBudget: () => budget-- > 0,
    });
    expect(results.map((r) => r.outcome)).toEqual(['ADVANCED', 'NOT_PROCESSED', 'NOT_PROCESSED']);
    expect(order.filter((c) => c.id === '501' || c.id === '8')).toEqual([]);
  });
});

describe('discard', () => {
  it('requires a reason when the configuration says so', () => {
    expect(() =>
      service.discard({ lineIds: ['7'], employeeId: '100', channel: 'NETSUITE', reason: '  ' }),
    ).toThrow(expect.objectContaining({ name: 'GPV_DISCARD_REASON_REQUIRED' }));
    expect(order).toEqual([]);
  });

  it('frees the bill, clears its boxes and records who and why', () => {
    givenLines([{ id: '7', billId: '500', status: 'val_gpv_pending', levelId: '12' }]);

    const [result] = service.discard({
      lineIds: ['7'],
      employeeId: '200',
      channel: 'NETSUITE',
      reason: ' Sin presupuesto ',
    });
    expect(result.outcome).toBe('DISCARDED');
    expect(order[0].values).toEqual({
      custbody_gpv_dir_approval: false,
      custbody_gpv_cfo_approval: false,
      custbody_gpv_authorization_status: 'val_gpv_discarded',
    });
    expect(order[1].entry).toEqual(
      expect.objectContaining({ action: 'DISCARD', reason: 'Sin presupuesto' }),
    );
    expect(order[2].values).toEqual({
      custrecord_gpv_pl_status: 'val_gpv_discarded',
      custrecord_gpv_pl_level: '',
      custrecord_gpv_pl_discard_reason: 'Sin presupuesto',
      custrecord_gpv_pl_discarded_by: '200',
    });
  });

  it('allows no reason when the configuration does not require it', () => {
    configLib.getConfig.mockReturnValue({ discardReasonRequired: false });
    givenLines([{ id: '7', billId: '500', status: 'val_gpv_pending', levelId: '11' }]);

    const [result] = service.discard({ lineIds: ['7'], employeeId: '100', channel: 'NETSUITE' });
    expect(result.outcome).toBe('DISCARDED');
  });
});
