import proposal from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_proposal_lib';
import stateMachine from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_line_state_machine_lib';

jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const { validateLevels, buildLine, sumByCurrency, toCsv } = proposal;
const { LineStatus } = stateMachine;

const LEVELS = [
  { id: '11', name: 'Director', order: 1, approvalField: 'custbody_gpv_dir_approval' },
  { id: '12', name: 'CFO', order: 2, approvalField: 'custbody_gpv_cfo_approval' },
  { id: '13', name: 'CEO 1', order: 3, approvalField: 'custbody_gpv_ceo1_approval' },
  { id: '14', name: 'CEO 2', order: 4, approvalField: 'custbody_gpv_ceo2_approval' },
];

/** Approvals object with the given level orders checked. */
const checked = (...orders) =>
  Object.fromEntries(LEVELS.map((l) => [l.approvalField, orders.includes(l.order)]));

describe('validateLevels', () => {
  it('accepts a chain 1..n', () => {
    expect(() => validateLevels(LEVELS)).not.toThrow();
  });

  it.each([
    ['no levels', []],
    ['a gap in the order', [LEVELS[0], LEVELS[2]]],
    ['a level without approval field', [{ ...LEVELS[0], approvalField: '' }]],
  ])('rejects %s', (_label, levels) => {
    expect(() => validateLevels(levels)).toThrow(
      expect.objectContaining({ name: 'GPV_INVALID_LEVELS' }),
    );
  });
});

describe('buildLine', () => {
  it('starts at the Director when nothing is checked', () => {
    expect(buildLine(checked(), LEVELS)).toEqual({
      status: LineStatus.PENDING,
      level: LEVELS[0],
      levelsToClear: [],
    });
  });

  it('starts at the CFO when the Director approved before the meeting', () => {
    expect(buildLine(checked(1), LEVELS).level).toBe(LEVELS[1]);
  });

  it('is born authorized when every level is checked', () => {
    expect(buildLine(checked(1, 2, 3, 4), LEVELS)).toEqual({
      status: LineStatus.AUTHORIZED,
      level: null,
      levelsToClear: [],
    });
  });

  it('keeps the Director and restarts at the CFO when the rest is out of order', () => {
    expect(buildLine(checked(1, 3), LEVELS)).toEqual({
      status: LineStatus.PENDING,
      level: LEVELS[1],
      levelsToClear: [LEVELS[2]],
    });
  });

  it('restarts at the Director and clears out-of-order approvals', () => {
    expect(buildLine(checked(2, 4), LEVELS)).toEqual({
      status: LineStatus.PENDING,
      level: LEVELS[0],
      levelsToClear: [LEVELS[1], LEVELS[3]],
    });
  });

  it("reads search checkbox values ('T')", () => {
    expect(buildLine({ custbody_gpv_dir_approval: 'T' }, LEVELS).level).toBe(LEVELS[1]);
  });
});

describe('sumByCurrency', () => {
  it('adds per currency without float drift', () => {
    expect(
      sumByCurrency([
        { amount: 0.1, currency: 'MXN' },
        { amount: 0.2, currency: 'MXN' },
        { amount: 100, currency: 'USD' },
      ]),
    ).toEqual({ MXN: 0.3, USD: 100 });
  });

  it('returns an empty object for no items', () => {
    expect(sumByCurrency([])).toEqual({});
  });
});

describe('toCsv', () => {
  it('starts with a BOM, uses CRLF and quotes special cells', () => {
    expect(toCsv(['Nombre', 'Nota'], [['Proveedor, S.A.', 'dice "hola"\nadiós']])).toBe(
      '﻿Nombre,Nota\r\n"Proveedor, S.A.","dice ""hola""\nadiós"',
    );
  });

  it('writes checkboxes as Sí/No and empty values as blank', () => {
    expect(toCsv(['A', 'B', 'C', 'D'], [[true, false, null, 0]])).toBe('﻿A,B,C,D\r\nSí,No,,0');
  });

  it('writes checkboxes that the search returns as T/F as Sí/No', () => {
    expect(toCsv(['A', 'B'], [['T', 'F']])).toBe('﻿A,B\r\nSí,No');
  });
});
