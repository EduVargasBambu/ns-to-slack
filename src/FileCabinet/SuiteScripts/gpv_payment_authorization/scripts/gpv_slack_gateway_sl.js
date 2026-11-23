/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @description Public entry point for Slack interactivity. Every request must carry a valid
 * Slack signature; anything else is ignored. Piece 1: verifies and logs, no business action yet.
 */
define(['../slack/gpv_slack_signature_lib'], (signature) => {
  const TITLE = 'gpv_slack_gateway_sl';

  /** @param {import('N/types').EntryPoints.Suitelet.onRequestContext} context */
  const onRequest = ({ request, response }) => {
    if (request.method !== 'POST') {
      response.write('OK');
      return;
    }

    const body = request.body || '';
    const check = signature.verify({ headers: request.headers, body });
    log.audit(TITLE, {
      valid: check.valid,
      reason: check.reason,
      // Piece 1 question: does NetSuite hand over the raw form body Slack signed?
      rawBodyLength: body.length,
      parameterNames: Object.keys(request.parameters || {}),
    });
    if (!check.valid) {
      // Suitelets cannot set an HTTP status; a bare answer gives the caller nothing.
      response.write('OK');
      return;
    }

    // Only a summary: the payload also carries Slack's legacy verification token.
    const payload = JSON.parse(request.parameters.payload || '{}');
    log.audit(TITLE, {
      type: payload.type,
      slackUser: payload.user && payload.user.id,
      action: payload.actions && payload.actions[0] && payload.actions[0].action_id,
    });
    // write() rejects an empty string; Slack ignores the body of a block_actions answer.
    response.write('OK');
  };

  return { onRequest };
});
