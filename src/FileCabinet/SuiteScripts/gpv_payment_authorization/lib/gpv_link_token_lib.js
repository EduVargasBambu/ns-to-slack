/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Signed, stateless link token `{employeeId}.{expSeconds}.{hmacHex}` for approvers
 * without a NetSuite login. It is the only authentication of the external page.
 */
define(['N/crypto', 'N/error', './gpv_constants_lib', '../slack/gpv_slack_signature_lib'], (
  /** @type {typeof import('N/crypto')} */ crypto,
  /** @type {typeof import('N/error')} */ error,
  constants,
  signatureLib,
) => {
  const TTL_SECONDS = 7 * 24 * 60 * 60;
  const TOKEN_FORMAT = /^(\d+)\.(\d+)\.([0-9a-f]{64})$/;

  /**
   * @param {string} employeeId
   * @param {number|string} expSeconds Verbatim from the token when verifying (no normalizing).
   * @returns {string} HMAC-SHA256 (lowercase hex) of `{employeeId}.{expSeconds}`.
   */
  const sign = (employeeId, expSeconds) => {
    const hmac = crypto.createHmac({
      algorithm: crypto.HashAlg.SHA256,
      key: crypto.createSecretKey({
        secret: constants.Secret.LINK_KEY,
        encoding: crypto.Encoding.UTF_8,
      }),
    });
    hmac.update({ input: `${employeeId}.${expSeconds}`, inputEncoding: crypto.Encoding.UTF_8 });
    return hmac.digest({ outputEncoding: crypto.Encoding.HEX }).toLowerCase();
  };

  /**
   * @param {object} options
   * @param {string} options.employeeId Internal id (digits only).
   * @param {number} [options.nowSeconds] Defaults to the current time.
   * @returns {string}
   */
  const create = ({ employeeId, nowSeconds = Math.floor(Date.now() / 1000) }) => {
    if (!/^\d+$/.test(String(employeeId))) {
      throw error.create({
        name: 'GPV_INVALID_LINK_EMPLOYEE',
        message: `employeeId must be all digits: ${employeeId}`,
      });
    }
    const expSeconds = nowSeconds + TTL_SECONDS;
    return `${employeeId}.${expSeconds}.${sign(String(employeeId), expSeconds)}`;
  };

  /**
   * @param {string} token
   * @param {number} [nowSeconds] Defaults to the current time.
   * @returns {{ valid: boolean, employeeId: string, reason: string }} reason is for the log.
   */
  const verify = (token, nowSeconds = Math.floor(Date.now() / 1000)) => {
    const parts = typeof token === 'string' ? TOKEN_FORMAT.exec(token) : null;
    if (!parts) return { valid: false, employeeId: '', reason: 'formato inválido' };
    const [, employeeId, exp, signature] = parts;
    // Signature first: an unsigned expiry must not tell the caller anything.
    if (!signatureLib.safeEqual(sign(employeeId, exp), signature))
      return { valid: false, employeeId: '', reason: 'firma inválida' };
    if (nowSeconds > Number(exp)) return { valid: false, employeeId: '', reason: 'caducado' };
    return { valid: true, employeeId, reason: '' };
  };

  return { TTL_SECONDS, create, verify };
});
