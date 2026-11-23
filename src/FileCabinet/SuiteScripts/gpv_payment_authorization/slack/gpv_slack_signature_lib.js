/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Verifies that a request really comes from Slack (signing secret, v0 scheme).
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
define(['N/crypto', '../lib/gpv_constants_lib'], (
  /** @type {typeof import('N/crypto')} */ crypto,
  constants,
) => {
  /** Slack's recommended window against replayed requests. */
  const MAX_AGE_SECONDS = 5 * 60;

  /**
   * Header value regardless of case (NetSuite does not normalize header names).
   * @param {Record<string, string>} headers
   * @param {string} name
   * @returns {string}
   */
  const getHeader = (headers, name) => {
    const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key]) : '';
  };

  /**
   * @param {string} timestamp X-Slack-Request-Timestamp (seconds).
   * @param {number} nowSeconds
   * @returns {boolean}
   */
  const isFresh = (timestamp, nowSeconds) =>
    /^\d+$/.test(timestamp) && Math.abs(nowSeconds - Number(timestamp)) <= MAX_AGE_SECONDS;

  /**
   * Compares in constant time so the response time does not leak how much of a guess matched.
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  const safeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };

  /**
   * `v0=` + HMAC-SHA256 of `v0:{timestamp}:{body}` with the signing secret (API Secret).
   * @param {string} timestamp
   * @param {string} body Raw request body, exactly as Slack sent it.
   * @returns {string}
   */
  const sign = (timestamp, body) => {
    const hmac = crypto.createHmac({
      algorithm: crypto.HashAlg.SHA256,
      key: crypto.createSecretKey({
        secret: constants.Secret.SLACK_SIGNING_SECRET,
        encoding: crypto.Encoding.UTF_8,
      }),
    });
    hmac.update({ input: `v0:${timestamp}:${body}`, inputEncoding: crypto.Encoding.UTF_8 });
    return `v0=${hmac.digest({ outputEncoding: crypto.Encoding.HEX }).toLowerCase()}`;
  };

  /**
   * @param {object} options
   * @param {Record<string, string>} options.headers Request headers.
   * @param {string} options.body Raw request body.
   * @param {number} [options.nowSeconds] Defaults to the current time.
   * @returns {{ valid: boolean, reason: string }} reason explains a rejection (for the log).
   */
  const verify = ({ headers, body, nowSeconds = Math.floor(Date.now() / 1000) }) => {
    const timestamp = getHeader(headers, 'X-Slack-Request-Timestamp');
    const signature = getHeader(headers, 'X-Slack-Signature').toLowerCase();
    if (!timestamp || !signature)
      return { valid: false, reason: 'faltan los encabezados de Slack' };
    if (!isFresh(timestamp, nowSeconds)) return { valid: false, reason: 'timestamp vencido' };
    if (!body) return { valid: false, reason: 'cuerpo vacío' };
    return safeEqual(sign(timestamp, body), signature)
      ? { valid: true, reason: '' }
      : { valid: false, reason: 'firma inválida' };
  };

  return { getHeader, isFresh, safeEqual, verify };
});
