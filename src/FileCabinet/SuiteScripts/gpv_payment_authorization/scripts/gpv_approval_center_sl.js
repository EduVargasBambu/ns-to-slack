/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @description Approval Center. GET serves the page; the page calls GET ?action=pending and
 * POST ?action=approve|discard. Internal deployment: the employee comes from the NetSuite session.
 * External deployment (available without login): the employee comes from the signed token in the
 * X-GPV-Token header. Only the deployment id picks the path, never the request.
 */
define([
  'N/runtime',
  'N/file',
  'N/error',
  'N/search',
  '../lib/gpv_constants_lib',
  '../lib/gpv_pending_lines_lib',
  '../lib/gpv_approval_service_lib',
  '../lib/gpv_audit_log_lib',
  '../lib/gpv_link_token_lib',
  '../lib/gpv_approval_lib',
  '../lib/gpv_approval_level_lib',
  '../slack/gpv_notifier_lib',
  '../slack/gpv_slack_signature_lib',
], (
  /** @type {typeof import('N/runtime')} */ runtime,
  /** @type {typeof import('N/file')} */ file,
  /** @type {typeof import('N/error')} */ error,
  /** @type {typeof import('N/search')} */ search,
  constants,
  pendingLines,
  approvalService,
  auditLog,
  linkToken,
  approvalLib,
  levelLib,
  notifier,
  signatureLib,
) => {
  const TITLE = 'gpv_approval_center_sl';
  /** Units kept after the last line for the Slack notices and the answer. */
  const RESERVED_USAGE = 350;
  const MAX_LINES = 500;
  /** Header the page sends: a cross-site form cannot set it, so it blocks CSRF. */
  const REQUEST_HEADER = 'X-GPV-Request';
  /** Signed link token of the external deployment. Never read from the query string. */
  const TOKEN_HEADER = 'X-GPV-Token';
  /** The only error the external deployment gives for any rejected token. */
  const EXPIRED_MESSAGE =
    'Este enlace ya caducó o no es válido. El lunes recibirás uno nuevo en Slack.';
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

  /**
   * Who is acting. External: valid token, active employee and a level that still approves by
   * external link; anything else is rejected (logged with the reason, never the token).
   * Internal: the session user must be a real employee (not the online-form user -4).
   * @param {Record<string, string>} headers
   * @returns {{ error: string, external: boolean, employeeId: string, employeeName: string }}
   *   `error` is the message for the caller when rejected ('' otherwise).
   */
  const resolveActor = (headers) => {
    const external =
      String(runtime.getCurrentScript().deploymentId).toLowerCase() ===
      constants.ApprovalCenter.EXTERNAL_DEPLOYMENT;
    if (!external) {
      const user = runtime.getCurrentUser();
      // Guards an anonymous caller if the deployment id ever came back empty on the external one.
      if (!(Number(user.id) > 0)) {
        log.audit(TITLE, `Usuario sin sesión de empleado rechazado (id ${user.id}).`);
        return { error: 'Acción no válida.', external, employeeId: '', employeeName: '' };
      }
      return { error: '', external, employeeId: String(user.id), employeeName: user.name };
    }
    /** @param {string} reason */
    const reject = (reason) => {
      log.audit(TITLE, `Enlace externo rechazado: ${reason}.`);
      return { error: EXPIRED_MESSAGE, external, employeeId: '', employeeName: '' };
    };
    const token = linkToken.verify(signatureLib.getHeader(headers, TOKEN_HEADER));
    if (!token.valid) return reject(token.reason);
    const { employeeId } = token;
    let employee;
    try {
      employee = search.lookupFields({
        type: search.Type.EMPLOYEE,
        id: employeeId,
        columns: ['isinactive', 'firstname', 'lastname', 'entityid'],
      });
    } catch {
      return reject(`empleado ${employeeId} no encontrado`);
    }
    if (['true', 'T'].includes(String(employee.isinactive))) {
      return reject(`empleado ${employeeId} inactivo`);
    }
    if (!approvalLib.isExternalLinkEmployee(levelLib.getLevels(), employeeId)) {
      return reject(`empleado ${employeeId} sin nivel con enlace externo`);
    }
    const employeeName =
      `${employee.firstname || ''} ${employee.lastname || ''}`.trim() ||
      String(employee.entityid || '');
    return { error: '', external, employeeId, employeeName };
  };

  /** @param {import('N/types').EntryPoints.Suitelet.onRequestContext} context */
  const onRequest = ({ request, response }) => {
    const action = request.parameters.action || '';

    // The page itself is public; the token is checked when the page asks for data.
    if (request.method === 'GET' && !action) {
      response.write(file.load({ id: constants.APPROVAL_CENTER_PAGE }).getContents());
      return;
    }
    const { error: rejection, external, employeeId, employeeName } = resolveActor(request.headers);
    if (rejection) {
      sendJson(response, { ok: false, error: rejection });
      return;
    }

    if (request.method === 'GET' && action === 'pending') {
      sendJson(response, {
        ok: true,
        userName: employeeName,
        groups: pendingLines.findForEmployee(employeeId),
      });
      return;
    }
    // Read-only treasury view: anyone with access to the internal Center may see it.
    if (request.method === 'GET' && action === 'authorized' && !external) {
      sendJson(response, {
        ok: true,
        userName: employeeName,
        groups: pendingLines.findAuthorized(),
      });
      return;
    }
    if (request.method !== 'POST' || !['approve', 'discard'].includes(action)) {
      sendJson(response, { ok: false, error: 'Acción no válida.' });
      return;
    }
    // Externally the token header already blocks CSRF (a cross-site form cannot set it).
    if (!external && !hasRequestHeader(request.headers)) {
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
        channel: external ? auditLog.AuditChannel.EXTERNAL_LINK : auditLog.AuditChannel.NETSUITE,
        hasBudget: () => script.getRemainingUsage() > RESERVED_USAGE,
      };
      const results =
        action === 'approve'
          ? approvalService.approve(options)
          : approvalService.discard({ ...options, reason });
      // Notices never fail the request: the approval is already saved.
      notifier.notifyAfterAction(results, { employeeId, employeeName, reason });
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
