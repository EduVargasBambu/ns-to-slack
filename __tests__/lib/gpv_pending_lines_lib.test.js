import search from 'N/search';
import configLib from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_config_lib';
import pending from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib';

jest.mock('N/search', () => ({ load: jest.fn() }));
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_config_lib',
  () => ({ getConfig: jest.fn() }),
);
global.log = { error: jest.fn() };
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const { sortLines, groupLines, groupByProposal, shortSubsidiaryName } = pending;

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
  priorityRank: 3,
  priority: '',
  billDate: '01/11/2026',
  memo: '',
  subsidiary: 'Ecovallas',
  vendorDescription: '',
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

describe('shortSubsidiaryName', () => {
  it('keeps only the last segment of a hierarchical name', () => {
    expect(shortSubsidiaryName('Grupo Vallas : Ecovallas')).toBe('Ecovallas');
    expect(shortSubsidiaryName('Ecovallas')).toBe('Ecovallas');
    expect(shortSubsidiaryName('')).toBe('');
  });
});

describe('sortLines', () => {
  const l = (lineId, priorityRank, currency, amount, subsidiary = 'Ecovallas') => ({
    ...line(lineId, '10', '11', amount, currency),
    priorityRank,
    subsidiary,
  });

  it('orders by subsidiary first, alphabetically', () => {
    const sorted = sortLines([
      l('eco-alto', 0, 'USD', 1, 'Ecovallas'),
      l('bambu-bajo', 2, 'USD', 1, 'Bambú'),
    ]);
    expect(sorted.map((x) => x.subsidiary)).toEqual(['Bambú', 'Ecovallas']);
  });

  it('puts lines without subsidiary last', () => {
    const sorted = sortLines([l('none', 0, 'USD', 1, ''), l('eco', 2, 'USD', 1, 'Ecovallas')]);
    expect(sorted.map((x) => x.subsidiary)).toEqual(['Ecovallas', '']);
  });

  it('orders by priority, then USD before MXN, then amount high to low', () => {
    const sorted = sortLines([
      l('none-usd', 3, 'USD', 999),
      l('low-mxn', 2, 'MXN', 5),
      l('high-mxn-small', 0, 'MXN', 10),
      l('high-usd', 0, 'USD', 1),
      l('high-mxn-big', 0, 'MXN', 500),
      l('high-eur', 0, 'EUR', 50),
      l('medium-mxn', 1, 'MXN', 1),
    ]);
    expect(sorted.map((x) => x.lineId)).toEqual([
      'high-usd',
      'high-mxn-big',
      'high-mxn-small',
      'high-eur',
      'medium-mxn',
      'low-mxn',
      'none-usd',
    ]);
  });

  it('keeps the search order (due date) on ties and does not mutate the input', () => {
    const input = [l('a', 3, 'MXN', 10), l('b', 3, 'MXN', 10)];
    expect(sortLines(input).map((x) => x.lineId)).toEqual(['a', 'b']);
    expect(sortLines(input)).not.toBe(input);
  });
});

describe('attachDetails', () => {
  const COLUMNS = [{ label: 'Serie', name: 'custbody_serie' }, { name: 'terms' }];
  const row = (id, values) => ({
    id,
    getText: (c) => values[c.label || c.name]?.text,
    getValue: (c) => values[c.label || c.name]?.value,
  });
  /** @param {object[]} rows */
  const mockSearch = (rows) => {
    const loaded = {
      columns: COLUMNS,
      filterExpression: [],
      run: () => ({ each: (fn) => rows.every(fn) }),
    };
    search.load.mockReturnValue(loaded);
    return loaded;
  };
  const billRows = [
    row('7', { Serie: { value: 'A' }, terms: { text: '30 días', value: '3' } }),
    row('8', { Serie: { value: 'B' }, terms: { value: '' } }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    configLib.getConfig.mockReturnValue({ pendingSearch: 'customsearch_x' });
  });

  it('applies the saved search columns to each line by bill', () => {
    mockSearch(billRows);
    const groups = [{ lines: [{ ...line('1', '10', '11', 1, 'MXN'), billId: '7' }] }];
    expect(pending.attachDetails(groups)).toEqual(['Serie', 'terms']);
    expect(groups[0].lines[0].details).toEqual(['A', '30 días']);
    expect(search.load).toHaveBeenCalledWith({ id: 'customsearch_x' });
  });

  it('replaces the saved search filters with the shown bills', () => {
    const loaded = mockSearch(billRows);
    pending.attachDetails([
      { lines: [{ billId: '7' }, { billId: '8' }] },
      { lines: [{ billId: '7' }] },
    ]);
    expect(loaded.filterExpression).toEqual([
      ['mainline', 'is', 'T'],
      'AND',
      ['internalid', 'anyof', ['7', '8']],
    ]);
  });

  it('gives the same details to two lines of the same bill', () => {
    mockSearch(billRows);
    const groups = [{ lines: [{ billId: '8' }] }, { lines: [{ billId: '8' }] }];
    pending.attachDetails(groups);
    expect(groups[0].lines[0].details).toEqual(['B', '']);
    expect(groups[1].lines[0].details).toEqual(['B', '']);
  });

  it('leaves lines without details when the search does not return their bill', () => {
    mockSearch(billRows);
    const groups = [{ lines: [{ billId: '99' }] }];
    expect(pending.attachDetails(groups)).toEqual(['Serie', 'terms']);
    expect(groups[0].lines[0]).not.toHaveProperty('details');
  });

  it('returns no details when the saved search is missing or fails', () => {
    configLib.getConfig.mockReturnValue({ pendingSearch: '' });
    expect(pending.attachDetails([{ lines: [{ billId: '7' }] }])).toEqual([]);
    expect(search.load).not.toHaveBeenCalled();

    configLib.getConfig.mockReturnValue({ pendingSearch: 'customsearch_x' });
    search.load.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(pending.attachDetails([{ lines: [{ billId: '7' }] }])).toEqual([]);
    expect(global.log.error).toHaveBeenCalledWith('gpv_pending_lines_lib', expect.any(String));

    configLib.getConfig.mockImplementation(() => {
      throw new Error('no config');
    });
    expect(pending.attachDetails([{ lines: [{ billId: '7' }] }])).toEqual([]);
  });

  it('does not search when there are no lines', () => {
    expect(pending.attachDetails([{ lines: [] }])).toEqual([]);
    expect(search.load).not.toHaveBeenCalled();
  });
});
