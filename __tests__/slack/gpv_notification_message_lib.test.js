import messages from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_notification_message_lib';

const { escapeMrkdwn, buildApproverDm, buildTreasuryMessage, buildApprovalConfirmation } = messages;

const URL = 'https://1234.app.netsuite.com/app/site/hosting/scriptlet.nl?script=1&deploy=1';

describe('escapeMrkdwn', () => {
  it('neutralizes mentions and links', () => {
    expect(escapeMrkdwn('<!channel> A & B <http://x|y>')).toBe(
      '&lt;!channel&gt; A &amp; B &lt;http://x|y&gt;',
    );
  });

  it('handles empty values', () => {
    expect(escapeMrkdwn(undefined)).toBe('');
  });
});

describe('buildApproverDm', () => {
  const groups = [
    {
      meetingDate: '23/11/2026',
      levelName: 'Director',
      lines: [1, 2, 3],
      totals: { MXN: 0.1, USD: 5 },
    },
    { meetingDate: '23/11/2026', levelName: 'CFO', lines: [4], totals: { MXN: 0.2 } },
  ];

  it('summarizes every group and links to the Approval Center', () => {
    const dm = buildApproverDm(groups, URL);
    expect(dm.text).toBe('Tienes 4 facturas por autorizar');
    expect(dm.blocks[0].text.text).toBe(
      [
        '*Tienes 4 facturas por autorizar*',
        '• Concentrado del 23/11/2026 · Director: 3',
        '• Concentrado del 23/11/2026 · CFO: 1',
        'Total: MXN $0.30 · USD $5.00',
      ].join('\n'),
    );
    expect(dm.blocks[1].elements[0]).toEqual(
      expect.objectContaining({ url: URL, text: { type: 'plain_text', text: 'Ver en NetSuite' } }),
    );
  });

  it('uses the singular for one bill', () => {
    expect(buildApproverDm([groups[1]], URL).text).toBe('Tienes 1 factura por autorizar');
  });

  it('returns null when nothing is waiting', () => {
    expect(buildApproverDm([], URL)).toBeNull();
  });
});

describe('buildTreasuryMessage', () => {
  const VIEW = `${URL}&view=authorized`;
  const line = (currency = 'MXN') => ({ amount: 1000.5, currency });

  it('gives the count and totals per currency, with a button to the authorized view', () => {
    const msg = buildTreasuryMessage([line(), line(), line('USD')], VIEW);
    expect(msg.text).toBe('3 facturas autorizadas para pago');
    expect(msg.blocks[0].text.text).toBe(
      '*3 facturas autorizadas para pago*\nTotal: MXN $2,001.00 · USD $1,000.50',
    );
    expect(msg.blocks[1].elements[0]).toEqual(
      expect.objectContaining({ url: VIEW, text: { type: 'plain_text', text: 'Ver autorizadas' } }),
    );
  });

  it('uses singular for one bill', () => {
    expect(buildTreasuryMessage([line()], VIEW).text).toBe('1 factura autorizada para pago');
  });

  it('returns null with no bills', () => {
    expect(buildTreasuryMessage([], VIEW)).toBeNull();
  });
});

describe('buildApprovalConfirmation', () => {
  it('says how many were approved, the total and where they went', () => {
    expect(
      buildApprovalConfirmation({
        lines: [
          { amount: 100, currency: 'MXN' },
          { amount: 50, currency: 'MXN' },
          { amount: 10, currency: 'USD' },
        ],
        nextLevels: [
          { levelName: 'CFO', count: 2 },
          { levelName: 'CEO <1>', count: 1 },
        ],
        authorizedCount: 0,
      }),
    ).toBe(
      [
        '*✅ Aprobaste 3 facturas*',
        'Total: MXN $150.00 · USD $10.00',
        '• 2 pasan a CFO',
        '• 1 pasa a CEO &lt;1&gt;',
      ].join('\n'),
    );
  });

  it('mentions the ones authorized for payment', () => {
    const text = buildApprovalConfirmation({
      lines: [{ amount: 1, currency: 'MXN' }],
      nextLevels: [],
      authorizedCount: 1,
    });
    expect(text).toContain('*✅ Aprobaste 1 factura*');
    expect(text).toContain('• 1 quedó autorizada para pago');
  });

  it('returns null when nothing was approved', () => {
    expect(buildApprovalConfirmation({ lines: [], nextLevels: [], authorizedCount: 0 })).toBeNull();
  });
});
