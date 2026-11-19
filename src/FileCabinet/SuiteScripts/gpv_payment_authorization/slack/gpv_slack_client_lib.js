/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Minimal Slack Web API client. The bot token is read from API Secrets, never from code.
 */
define(['N/https', 'N/error', '../lib/gpv_constants_lib'], (
  /** @type {typeof import('N/https')} */ https,
  /** @type {typeof import('N/error')} */ error,
  constants,
) => {
  const API_URL = 'https://slack.com/api/';

  /**
   * Calls a Slack Web API method with a JSON body.
   * @param {string} method Slack method, e.g. 'chat.postMessage'.
   * @param {object} payload JSON body.
   * @returns {Record<string, any>} Parsed Slack response (ok === true).
   * @throws {Error} GPV_SLACK_API_ERROR when the HTTP call fails or Slack answers ok: false.
   */
  const call = (method, payload) => {
    const response = https.post({
      url: API_URL + method,
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: https.createSecureString({
          input: `Bearer {${constants.Secret.SLACK_BOT_TOKEN}}`,
        }),
      },
    });

    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = null;
    }

    if (response.code !== 200 || !body || body.ok !== true) {
      // Slack reports failures in body.error (e.g. not_in_channel, invalid_auth); no token here.
      const reason = (body && body.error) || `HTTP ${response.code}`;
      throw error.create({ name: 'GPV_SLACK_API_ERROR', message: `${method}: ${reason}` });
    }
    return body;
  };

  /**
   * Posts a plain text message to a channel.
   * @param {string} channel Channel ID (C...).
   * @param {string} text Message text.
   * @returns {{ channel: string, ts: string }}
   * @throws {Error} GPV_SLACK_API_ERROR
   */
  const postMessage = (channel, text) => {
    const { channel: postedChannel, ts } = call('chat.postMessage', { channel, text });
    return { channel: postedChannel, ts };
  };

  return { call, postMessage };
});
