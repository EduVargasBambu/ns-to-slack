/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @description Approval Center (internal, NetSuite session). GET serves the page; the page calls
 * GET ?action=pending and POST ?action=approve|discard. The employee always comes from the
 * session, never from the request.
 */
define([
  'N/runtime',
  'N/file',
  'N/error',
  '../lib/gpv_constants_lib',
  '../lib/gpv_pending_lines_lib',
  '../lib/gpv_approval_service_lib',
  '../lib/gpv_audit_log_lib',
], (
  /** @type {typeof import('N/runtime')} */ runtime,
  /** @type {typeof import('N/file')} */ file,
  /** @type {typeof import('N/error')} */ error,
  constants,
  pendingLines,
  approvalService,
  auditLog,
) => {
  const TITLE = 'gpv_approval_center_sl';
  /** Units kept to answer after the last line. */
  const RESERVED_USAGE = 100;
  const MAX_LINES = 500;
  /** Header the page sends: a cross-site form cannot set it, so it blocks CSRF. */
  const REQUEST_HEADER = 'X-GPV-Request';
  /** Errors whose message is written for the user; anything else is logged and hidden. */
  const USER_ERRORS = ['GPV_INVALID_REQUEST', 'GPV_DISCARD_REASON_REQUIRED'];

  /**
   * @param {import('N/http').ServerResponse} response
   * @param {object} body
   */
  const sendJson = (response, body) => {
    response.setHeader({ name: 'Content-Type', value: 'application/json; charset=utf-8' });
    response.write(JSON.stringify(body));
  };

  /** @param {Record<string, string>} headers */
  const hasRequestHeader = (headers) =>
    Object.keys(headers || {}).some(
      (k) => k.toLowerCase() === REQUEST_HEADER.toLowerCase() && headers[k] === '1',
    );

  /**
   * Validates the body of approve/discard.
   * @param {string} raw
   * @returns {{ lineIds: string[], reason: string }}
   * @throws {Error} GPV_INVALID_REQUEST
   */
  const parseActionBody = (raw) => {
    const invalid = () =>
      error.create({ name: 'GPV_INVALID_REQUEST', message: 'Selecciona al menos una factura.' });
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      throw invalid();
    }
    /** @type {string[]} */
    const lineIds = Array.isArray(body.lineIds) ? body.lineIds.map(String) : [];
    if (!lineIds.length || lineIds.length > MAX_LINES || !lineIds.every((id) => /^\d+$/.test(id))) {
      throw invalid();
    }
    return { lineIds, reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : '' };
  };

  /**
   * @param {{ outcome: string }[]} results
   * @returns {Record<string, number>} Count per outcome.
   */
  const countOutcomes = (results) =>
    results.reduce(
      (acc, { outcome }) => ({ ...acc, [outcome]: (acc[outcome] || 0) + 1 }),
      /** @type {Record<string, number>} */ ({}),
    );

  /** @param {import('N/types').EntryPoints.Suitelet.onRequestContext} context */
  const onRequest = ({ request, response }) => {
    const action = request.parameters.action || '';
    const user = runtime.getCurrentUser();
    const employeeId = String(user.id);

    if (request.method === 'GET' && !action) {
      response.write(file.load({ id: constants.APPROVAL_CENTER_PAGE }).getContents());
      return;
    }
    if (request.method === 'GET' && action === 'pending') {
      sendJson(response, {
        ok: true,
        userName: user.name,
        groups: pendingLines.findForEmployee(employeeId),
      });
      return;
    }
    if (request.method !== 'POST' || !['approve', 'discard'].includes(action)) {
      sendJson(response, { ok: false, error: 'Acción no válida.' });
      return;
    }
    if (!hasRequestHeader(request.headers)) {
      log.audit(TITLE, `POST sin ${REQUEST_HEADER} rechazado. Empleado ${employeeId}.`);
      sendJson(response, { ok: false, error: 'Petición no válida.' });
      return;
    }

    try {
      const { lineIds, reason } = parseActionBody(request.body);
      const script = runtime.getCurrentScript();
      const options = {
        lineIds,
        employeeId,
        channel: auditLog.AuditChannel.NETSUITE,
        hasBudget: () => script.getRemainingUsage() > RESERVED_USAGE,
      };
      const results =
        action === 'approve'
          ? approvalService.approve(options)
          : approvalService.discard({ ...options, reason });
      sendJson(response, { ok: true, counts: countOutcomes(results) });
    } catch (e) {
      const err = /** @type {{ name?: string, message?: string }} */ (e);
      const forUser = USER_ERRORS.includes(String(err.name));
      if (!forUser) log.error(TITLE, err);
      sendJson(response, {
        ok: false,
        error: forUser ? err.message : 'No se pudo completar. Intenta de nuevo o avisa a sistemas.',
      });
    }
  };

  return { onRequest };
});
