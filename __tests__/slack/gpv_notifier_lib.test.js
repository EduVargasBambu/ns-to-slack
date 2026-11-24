import search from 'N/search';
import slackClient from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_slack_client_lib';
import pendingLines from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib';
import configLib from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_config_lib';
import notifier from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_notifier_lib';

jest.mock('N/url', () => ({
  HostType: { APPLICATION: 'APPLICATION' },
  resolveDomain: () => '1234.app.netsuite.com',
  resolveScript: ({ params }) =>
    `/app/site/hosting/scriptlet.nl?script=9&deploy=1${params ? `&view=${params.view}` : ''}`,
}));
jest.mock('N/search', () => ({ Type: { EMPLOYEE: 'employee' }, lookupFields: jest.fn() }));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_level_lib',
  () => ({
    getLevels: () => [
      {
        id: '11',
        name: 'Director',
        order: 1,
        approvalField: 'a',
        approverId: '100',
        substituteId: '',
      },
      { id: '12', name: 'CFO', order: 2, approvalField: 'b', approverId: '100', substituteId: '' },
      {
        id: '13',
        name: 'CEO 1',
        order: 3,
        approvalField: 'c',
        approverId: '300',
        substituteId: '',
      },
      {
        id: '14',
        name: 'CEO 2',
        order: 4,
        approvalField: 'd',
        approverId: '400',
        substituteId: '',
      },
    ],
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib',
  () => ({ findForEmployee: jest.fn(), findByIds: jest.fn() }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_config_lib',
  () => ({
    getConfig: jest.fn(),
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_slack_client_lib',
  () => ({ call: jest.fn(), postMessage: jest.fn() }),
);

global.log = { audit: jest.fn(), error: jest.fn() };

const SLACK_IDS = { 100: 'U100', 300: '', 400: 'U400' };
const GROUP = { meetingDate: '23/11/2026', levelName: 'CFO', lines: [1], totals: { MXN: 10 } };

beforeEach(() => {
  jest.clearAllMocks();
  search.lookupFields.mockImplementation(({ id }) => ({
    custentity_gpv_slack_user: SLACK_IDS[id],
  }));
  pendingLines.findForEmployee.mockReturnValue([GROUP]);
  configLib.getConfig.mockReturnValue({ treasuryChannel: 'CTREAS' });
});

describe('notifyLevels', () => {
  it('sends one DM per approver with a link to the Approval Center', () => {
    expect(notifier.notifyLevels(['11', '12', '12'])).toBe(1);
    expect(slackClient.call).toHaveBeenCalledTimes(1);
    const [method, payload] = slackClient.call.mock.calls[0];
    expect(method).toBe('chat.postMessage');
    expect(payload.channel).toBe('U100');
    expect(payload.blocks[1].elements[0].url).toBe(
      'https://1234.app.netsuite.com/app/site/hosting/scriptlet.nl?script=9&deploy=1',
    );
  });

  it('skips approvers without Slack user and keeps going when one DM fails', () => {
    slackClient.call.mockImplementationOnce(() => {
      throw new Error('channel_not_found');
    });
    expect(notifier.notifyLevels(['11', '13', '14'])).toBe(1);
    expect(slackClient.call.mock.calls.map(([, p]) => p.channel)).toEqual(['U100', 'U400']);
    expect(global.log.error).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the approver has nothing waiting', () => {
    pendingLines.findForEmployee.mockReturnValue([]);
    expect(notifier.notifyLevels(['11'])).toBe(0);
    expect(slackClient.call).not.toHaveBeenCalled();
  });
});

describe('notifyAllApprovers', () => {
  it('checks every level, once per approver, and skips those without Slack user', () => {
    expect(notifier.notifyAllApprovers()).toBe(2);
    expect(slackClient.call.mock.calls.map(([, p]) => p.channel)).toEqual(['U100', 'U400']);
  });

  it('sends nothing to an approver with nothing pending', () => {
    pendingLines.findForEmployee.mockReturnValue([]);
    expect(notifier.notifyAllApprovers()).toBe(0);
  });
});

describe('notifyApprover', () => {
  it('sends nothing for discards only or without a Slack user', () => {
    expect(notifier.notifyApprover('100', [{ lineId: '9', outcome: 'DISCARDED' }])).toBe(false);
    expect(
      notifier.notifyApprover('300', [{ lineId: '8', outcome: 'AUTHORIZED', nextLevelId: null }]),
    ).toBe(false);
    expect(slackClient.postMessage).not.toHaveBeenCalled();
  });
});

describe('notifyAfterAction', () => {
  it('confirms to the approver and notifies the next level and treasury', () => {
    pendingLines.findByIds.mockImplementation((ids) =>
      ids.map(() => ({ vendor: 'Prov', billNumber: 'F-1', amount: 5, currency: 'MXN' })),
    );
    notifier.notifyAfterAction(
      [
        { lineId: '7', outcome: 'ADVANCED', nextLevelId: '14' },
        { lineId: '8', outcome: 'AUTHORIZED', nextLevelId: null },
        { lineId: '9', outcome: 'DISCARDED' },
      ],
      '100',
    );
    expect(slackClient.postMessage).toHaveBeenCalledWith(
      'U100',
      [
        '*✅ Aprobaste 2 facturas*',
        'Total: MXN $10.00',
        '• 1 pasa a CEO 2',
        '• 1 quedó autorizada para pago',
      ].join('\n'),
    );
    expect(slackClient.call.mock.calls.map(([, p]) => p.channel)).toEqual(['U400', 'CTREAS']);
    expect(pendingLines.findByIds).toHaveBeenCalledWith(['7', '8']);
    expect(pendingLines.findByIds).toHaveBeenCalledWith(['8']);
    const notice = slackClient.call.mock.calls[1][1];
    expect(notice.text).toBe('1 factura autorizada para pago');
    expect(notice.blocks[1].elements[0].url).toBe(
      'https://1234.app.netsuite.com/app/site/hosting/scriptlet.nl?script=9&deploy=1&view=authorized',
    );
  });

  it('never throws when treasury cannot be notified', () => {
    configLib.getConfig.mockImplementation(() => {
      throw new Error('GPV_CONFIG_NOT_FOUND');
    });
    expect(() =>
      notifier.notifyAfterAction([{ lineId: '8', outcome: 'AUTHORIZED', nextLevelId: null }]),
    ).not.toThrow();
    expect(global.log.error).toHaveBeenCalled();
  });
});
