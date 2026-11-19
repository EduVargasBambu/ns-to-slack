import record from 'N/record';
import search from 'N/search';
import auditLog from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_audit_log_lib';

jest.mock('N/record', () => ({ create: jest.fn() }));
jest.mock('N/search', () => ({ create: jest.fn() }));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));
jest.mock('../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_list_lib', () => ({
  getValueId: (listId, valueScriptId) => `${listId}#${valueScriptId}`,
}));

const { AuditAction, AuditChannel, buildIdempotencyKey, write, writeMany } = auditLog;

/** Existing audit logs returned by the idempotency search: [{ id, key }]. */
const givenExisting = (rows) =>
  search.create.mockReturnValue({
    run: () => ({
      each: (cb) => rows.forEach((r) => cb({ id: r.id, getValue: () => r.key })),
    }),
  });

/** Every record.create returns a fake record; saves return 100, 101, ... */
let saved;
const givenRecords = () => {
  saved = [];
  let nextId = 100;
  record.create.mockImplementation(() => {
    const values = {};
    return {
      setValue: ({ fieldId, value }) => (values[fieldId] = value),
      save: () => {
        saved.push(values);
        return nextId++;
      },
    };
  });
};

const approve = (lineId) => ({
  action: AuditAction.APPROVE,
  channel: AuditChannel.SLACK,
  proposalId: 7,
  lineId,
  levelId: 2,
  employeeId: 55,
  slackUserId: 'U123',
  idempotencyKey: buildIdempotencyKey(lineId, 2, AuditAction.APPROVE),
});

beforeEach(() => {
  jest.clearAllMocks();
  givenExisting([]);
  givenRecords();
});

describe('buildIdempotencyKey', () => {
  it('joins line, level and action', () => {
    expect(buildIdempotencyKey(10, 2, AuditAction.APPROVE)).toBe('10:2:APPROVE');
  });
});

describe('write', () => {
  it('creates the record with list values resolved by scriptid and skips empty fields', () => {
    expect(write(approve(10))).toBe('100');
    expect(saved[0]).toEqual({
      custrecord_gpv_al_action: 'customlist_gpv_action#val_gpv_approve',
      custrecord_gpv_al_channel: 'customlist_gpv_channel#val_gpv_slack',
      custrecord_gpv_al_proposal: 7,
      custrecord_gpv_al_line: 10,
      custrecord_gpv_al_level: 2,
      custrecord_gpv_al_employee: 55,
      custrecord_gpv_al_slack_user: 'U123',
      custrecord_gpv_al_idempotency_key: '10:2:APPROVE',
    });
  });

  it('returns the existing id and creates nothing when the key already exists', () => {
    givenExisting([{ id: 42, key: '10:2:APPROVE' }]);

    expect(write(approve(10))).toBe('42');
    expect(record.create).not.toHaveBeenCalled();
  });

  it('does not search when there is no idempotency key', () => {
    const entry = {
      action: AuditAction.UNAUTHORIZED,
      channel: AuditChannel.SLACK,
      slackUserId: 'U9',
    };

    expect(write(entry)).toBe('100');
    expect(search.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: 'approve', channel: 'SLACK' }, 'acción inválida'],
    [{ action: 'APPROVE', channel: 'EMAIL' }, 'canal inválido'],
    [{ action: 'toString', channel: 'SLACK' }, 'acción inválida'],
  ])('rejects %o', (entry, message) => {
    expect(() => write(entry)).toThrow(message);
    expect(record.create).not.toHaveBeenCalled();
  });
});

describe('writeMany', () => {
  it('uses one search for all keys and creates only the missing entries, in order', () => {
    givenExisting([{ id: 42, key: '11:2:APPROVE' }]);

    expect(writeMany([approve(10), approve(11), approve(12)])).toEqual(['100', '42', '101']);
    expect(search.create).toHaveBeenCalledTimes(1);
    expect(search.create.mock.calls[0][0].filters).toEqual([
      ['custrecord_gpv_al_idempotency_key', 'is', '10:2:APPROVE'],
      'OR',
      ['custrecord_gpv_al_idempotency_key', 'is', '11:2:APPROVE'],
      'OR',
      ['custrecord_gpv_al_idempotency_key', 'is', '12:2:APPROVE'],
    ]);
  });

  it('creates a repeated key only once within the same batch', () => {
    expect(writeMany([approve(10), approve(10)])).toEqual(['100', '100']);
    expect(record.create).toHaveBeenCalledTimes(1);
  });

  it('validates every entry before writing any', () => {
    expect(() => writeMany([approve(10), { action: 'NOPE', channel: 'SLACK' }])).toThrow();
    expect(record.create).not.toHaveBeenCalled();
  });
});
