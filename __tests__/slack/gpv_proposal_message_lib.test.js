import message from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_proposal_message_lib';

const { formatAmount, buildProposalSummary } = message;

describe('formatAmount', () => {
  it.each([
    [0, '0.00'],
    [5.5, '5.50'],
    [1234567.891, '1,234,567.89'],
    [-1000, '-1,000.00'],
  ])('%p -> %s', (amount, expected) => {
    expect(formatAmount(amount)).toBe(expected);
  });
});

describe('buildProposalSummary', () => {
  it('lists totals by currency and pending bills by level', () => {
    expect(
      buildProposalSummary({
        meetingDate: '23/11/2026',
        billCount: 5,
        totals: { USD: 2500, MXN: 1500000.5 },
        pendingByLevel: [
          { name: 'Director', count: 3 },
          { name: 'CFO', count: 1 },
          { name: 'CEO 1', count: 0 },
        ],
        authorizedCount: 1,
      }),
    ).toBe(
      [
        '*Concentrado de la junta del 23/11/2026*',
        '5 facturas en el concentrado.',
        '',
        '*Totales*',
        '• MXN: $1,500,000.50',
        '• USD: $2,500.00',
        '',
        '*Esperando a*',
        '• Director: 3',
        '• CFO: 1',
        '• Ya autorizadas: 1',
      ].join('\n'),
    );
  });

  it('says so when there are no bills', () => {
    expect(
      buildProposalSummary({
        meetingDate: '23/11/2026',
        billCount: 0,
        totals: {},
        pendingByLevel: [],
        authorizedCount: 0,
      }),
    ).toBe(
      '*Concentrado de la junta del 23/11/2026*\nNo hay facturas pendientes de autorizar esta semana.',
    );
  });

  it('uses the singular for one bill', () => {
    expect(
      buildProposalSummary({
        meetingDate: '23/11/2026',
        billCount: 1,
        totals: { MXN: 10 },
        pendingByLevel: [{ name: 'Director', count: 1 }],
        authorizedCount: 0,
      }),
    ).toContain('1 factura en el concentrado.');
  });
});
