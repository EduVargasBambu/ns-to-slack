import pending from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib';

jest.mock('N/search', () => ({}));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const { groupLines, groupByProposal } = pending;

const LEVELS = [
  { id: '11', name: 'Director', order: 1, approvalField: 'a', approverId: '100', substituteId: '' },
  { id: '12', name: 'CFO', order: 2, approvalField: 'b', approverId: '100', substituteId: '' },
];
const line = (lineId, proposalId, levelId, amount, currency) => ({
  lineId,
  proposalId,
  meetingDate: `fecha ${proposalId}`,
  levelId,
  billId: `b${lineId}`,
  billNumber: `F-${lineId}`,
  vendor: 'Proveedor',
  amount,
  currency,
  dueDate: '30/11/2026',
});

describe('groupLines', () => {
  it('groups by proposal and level, oldest proposal and lowest level first, with totals', () => {
    const groups = groupLines(
      [
        line('1', '20', '12', 100, 'MXN'),
        line('2', '10', '11', 50.5, 'USD'),
        line('3', '20', '11', 10, 'MXN'),
        line('4', '20', '11', 0.25, 'MXN'),
      ],
      LEVELS,
    );

    expect(
      groups.map((g) => ({
        key: `${g.proposalId}:${g.levelName}`,
        ids: g.lines.map((l) => l.lineId),
        totals: g.totals,
      })),
    ).toEqual([
      { key: '10:Director', ids: ['2'], totals: { USD: 50.5 } },
      { key: '20:Director', ids: ['3', '4'], totals: { MXN: 10.25 } },
      { key: '20:CFO', ids: ['1'], totals: { MXN: 100 } },
    ]);
    expect(groups[0]).toEqual(
      expect.objectContaining({ meetingDate: 'fecha 10', levelId: '11', levelName: 'Director' }),
    );
    expect(groups[0]).not.toHaveProperty('levelOrder');
  });

  it('skips lines whose level is not configured', () => {
    expect(groupLines([line('1', '10', '99', 1, 'MXN')], LEVELS)).toEqual([]);
  });
});

describe('groupByProposal', () => {
  it('groups by proposal only, oldest first, with totals', () => {
    const groups = groupByProposal([
      line('1', '20', '14', 100, 'MXN'),
      line('2', '10', '', 50.5, 'USD'),
      line('3', '20', '13', 0.25, 'MXN'),
    ]);
    expect(groups.map((g) => [g.proposalId, g.lines.map((l) => l.lineId), g.totals])).toEqual([
      ['10', ['2'], { USD: 50.5 }],
      ['20', ['1', '3'], { MXN: 100.25 }],
    ]);
    expect(groups[0].meetingDate).toBe('fecha 10');
  });
});
