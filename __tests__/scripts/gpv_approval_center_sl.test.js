import runtime from 'N/runtime';
import search from 'N/search';
import linkToken from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_link_token_lib';
import levelLib from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_level_lib';
import pendingLines from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib';
import approvalService from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_service_lib';
import notifier from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_notifier_lib';
import suitelet from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/scripts/gpv_approval_center_sl';

jest.mock('N/runtime', () => ({ getCurrentScript: jest.fn(), getCurrentUser: jest.fn() }));
jest.mock('N/file', () => ({ load: () => ({ getContents: () => '<html></html>' }) }));
jest.mock('N/search', () => ({ Type: { EMPLOYEE: 'employee' }, lookupFields: jest.fn() }));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_link_token_lib',
  () => ({ verify: jest.fn() }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_level_lib',
  () => ({ getLevels: jest.fn() }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib',
  () => ({
    findForEmployee: jest.fn(() => []),
    findAuthorized: jest.fn(() => []),
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_service_lib',
  () => ({
    approve: jest.fn(() => [{ outcome: 'APPROVED' }]),
    discard: jest.fn(() => []),
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_audit_log_lib',
  () => ({
    AuditChannel: { NETSUITE: 'NETSUITE', EXTERNAL_LINK: 'EXTERNAL_LINK' },
  }),
);
jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_notifier_lib',
  () => ({ notifyAfterAction: jest.fn() }),
);

global.log = { audit: jest.fn(), error: jest.fn(), debug: jest.fn() };

const EXPIRED_MESSAGE =
  'Este enlace ya caducó o no es válido. El lunes recibirás uno nuevo en Slack.';
const VALID = '30.9999999999.abc';
const EXTERNAL_LEVELS = [
  { id: '13', order: 3, approverId: '30', substituteId: '', externalLink: true },
];

/** @param {string} deploymentId */
const setDeployment = (deploymentId) =>
  runtime.getCurrentScript.mockReturnValue({ deploymentId, getRemainingUsage: () => 5000 });

const run = ({ method = 'GET', action = '', headers = {}, parameters = {}, body = '' } = {}) => {
  const written = [];
  suitelet.onRequest({
    request: { method, headers, body, parameters: { ...parameters, ...(action && { action }) } },
    response: { setHeader: jest.fn(), write: (s) => written.push(s) },
  });
  return written.join('');
};
const json = (opts) => JSON.parse(run(opts));

const expectNoWork = () => {
  expect(pendingLines.findForEmployee).not.toHaveBeenCalled();
  expect(approvalService.approve).not.toHaveBeenCalled();
  expect(approvalService.discard).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  setDeployment('CUSTOMDEPLOY_GPV_APPROVAL_CENTER_EXT');
  linkToken.verify.mockImplementation((t) =>
    t === VALID
      ? { valid: true, employeeId: '30', reason: '' }
      : { valid: false, employeeId: '', reason: 'formato inválido' },
  );
  levelLib.getLevels.mockReturnValue(EXTERNAL_LEVELS);
  search.lookupFields.mockReturnValue({ isinactive: false, firstname: 'Ana', lastname: 'Pérez' });
  runtime.getCurrentUser.mockReturnValue({ id: 10, name: 'Usuario Interno' });
});

describe('external deployment', () => {
  it('rejects external request without header token', () => {
    expect(json({ action: 'pending' })).toEqual({ ok: false, error: EXPIRED_MESSAGE });
    expect(
      json({ method: 'POST', action: 'approve', body: '{"lineIds":["5"]}', headers: {} }),
    ).toEqual({ ok: false, error: EXPIRED_MESSAGE });
    expectNoWork();
    expect(global.log.audit).toHaveBeenCalled();
  });

  it('ignores token in query string', () => {
    expect(json({ action: 'pending', parameters: { t: VALID } })).toEqual({
      ok: false,
      error: EXPIRED_MESSAGE,
    });
    expectNoWork();
  });

  it('rejects when level no longer uses external link', () => {
    levelLib.getLevels.mockReturnValue([{ ...EXTERNAL_LEVELS[0], externalLink: false }]);
    expect(json({ action: 'pending', headers: { 'x-gpv-token': VALID } })).toEqual({
      ok: false,
      error: EXPIRED_MESSAGE,
    });
    expectNoWork();
  });

  it.each([true, 'T'])('rejects inactive employee (isinactive %p)', (isinactive) => {
    search.lookupFields.mockReturnValue({ isinactive, firstname: 'Ana', lastname: 'Pérez' });
    expect(json({ action: 'pending', headers: { 'X-GPV-Token': VALID } })).toEqual({
      ok: false,
      error: EXPIRED_MESSAGE,
    });
    expectNoWork();
  });

  it('rejects when the employee lookup throws', () => {
    search.lookupFields.mockImplementation(() => {
      throw new Error('RCRD_DSNT_EXIST');
    });
    expect(json({ action: 'pending', headers: { 'X-GPV-Token': VALID } })).toEqual({
      ok: false,
      error: EXPIRED_MESSAGE,
    });
    expectNoWork();
  });

  it('never logs the token', () => {
    json({ action: 'pending', headers: { 'X-GPV-Token': 'bad.token' } });
    expect(JSON.stringify(global.log.audit.mock.calls)).not.toContain('bad.token');
  });

  it('serves the page without a token', () => {
    expect(run()).toBe('<html></html>');
  });

  it('serves pending lines for the token employee', () => {
    expect(json({ action: 'pending', headers: { 'X-GPV-Token': VALID } })).toEqual({
      ok: true,
      userName: 'Ana Pérez',
      groups: [],
    });
    expect(pendingLines.findForEmployee).toHaveBeenCalledWith('30');
  });

  it('rejects the authorized view externally', () => {
    expect(json({ action: 'authorized', headers: { 'X-GPV-Token': VALID } })).toEqual({
      ok: false,
      error: 'Acción no válida.',
    });
    expect(pendingLines.findAuthorized).not.toHaveBeenCalled();
  });

  it("approves as the token's employee through the external channel", () => {
    const res = json({
      method: 'POST',
      action: 'approve',
      headers: { 'X-GPV-Token': VALID },
      body: '{"lineIds":["5"]}',
    });
    expect(res).toEqual({ ok: true, counts: { APPROVED: 1 } });
    expect(approvalService.approve).toHaveBeenCalledWith(
      expect.objectContaining({ lineIds: ['5'], employeeId: '30', channel: 'EXTERNAL_LINK' }),
    );
    expect(notifier.notifyAfterAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ employeeId: '30', employeeName: 'Ana Pérez' }),
    );
  });
});

describe('external discard and name fallback', () => {
  it('discards as the token employee through the external channel', () => {
    json({
      method: 'POST',
      action: 'discard',
      headers: { 'X-GPV-Token': VALID },
      body: '{"lineIds":["5"],"reason":"x"}',
    });
    expect(approvalService.discard).toHaveBeenCalledWith(
      expect.objectContaining({
        lineIds: ['5'],
        employeeId: '30',
        channel: 'EXTERNAL_LINK',
        reason: 'x',
      }),
    );
  });

  it('falls back to entityid when first and last name are empty', () => {
    search.lookupFields.mockReturnValue({
      isinactive: false,
      firstname: '',
      lastname: '',
      entityid: 'CEO Uno',
    });
    expect(json({ action: 'pending', headers: { 'X-GPV-Token': VALID } }).userName).toBe('CEO Uno');
  });
});

describe('missing deployment id', () => {
  it('rejects a caller without an employee session', () => {
    setDeployment(undefined);
    runtime.getCurrentUser.mockReturnValue({ id: -4, name: '' });
    expect(json({ action: 'authorized' })).toEqual({ ok: false, error: 'Acción no válida.' });
    expect(json({ action: 'pending' })).toEqual({ ok: false, error: 'Acción no válida.' });
    expect(
      json({
        method: 'POST',
        action: 'approve',
        headers: { 'X-GPV-Request': '1' },
        body: '{"lineIds":["5"]}',
      }),
    ).toEqual({ ok: false, error: 'Acción no válida.' });
    expect(pendingLines.findAuthorized).not.toHaveBeenCalled();
    expectNoWork();
    expect(global.log.audit).toHaveBeenCalled();
  });
});

describe('internal deployment', () => {
  beforeEach(() => setDeployment('customdeploy_gpv_approval_center_sl'));

  it('internal deployment ignores token header', () => {
    json({ action: 'pending', headers: { 'X-GPV-Token': VALID } });
    expect(pendingLines.findForEmployee).toHaveBeenCalledWith('10');
    expect(linkToken.verify).not.toHaveBeenCalled();
  });

  it('still requires X-GPV-Request on POST', () => {
    expect(
      json({ method: 'POST', action: 'approve', headers: { 'X-GPV-Token': VALID }, body: '{}' }),
    ).toEqual({ ok: false, error: 'Petición no válida.' });
    expect(approvalService.approve).not.toHaveBeenCalled();
  });

  it('approves through the NetSuite channel', () => {
    json({
      method: 'POST',
      action: 'approve',
      headers: { 'X-GPV-Request': '1' },
      body: '{"lineIds":["5"]}',
    });
    expect(approvalService.approve).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: '10', channel: 'NETSUITE' }),
    );
  });
});
