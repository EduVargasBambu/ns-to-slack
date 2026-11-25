/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Writes the audit log. Entries with an idempotency key are created only once.
 */
define(['N/record', 'N/search', 'N/error', './gpv_constants_lib', './gpv_list_lib'], (
  /** @type {typeof import('N/record')} */ record,
  /** @type {typeof import('N/search')} */ search,
  /** @type {typeof import('N/error')} */ error,
  constants,
  listLib,
) => {
  const { AuditLog, ActionList, ChannelList } = constants;

  /** @enum {string} */
  const AuditAction = Object.freeze({
    APPROVE: 'APPROVE',
    DISCARD: 'DISCARD',
    UNAUTHORIZED: 'UNAUTHORIZED',
    CLEAR_LEGACY: 'CLEAR_LEGACY',
    WEEKLY_EXPIRY: 'WEEKLY_EXPIRY',
  });

  /** @enum {string} */
  const AuditChannel = Object.freeze({
    SLACK: 'SLACK',
    NETSUITE: 'NETSUITE',
    EXTERNAL_LINK: 'EXTERNAL_LINK',
  });

  /**
   * @typedef {object} AuditEntry
   * @property {string} action One of AuditAction.
   * @property {string} channel One of AuditChannel.
   * @property {string|number} [proposalId]
   * @property {string|number} [lineId]
   * @property {string|number} [levelId]
   * @property {string|number} [employeeId]
   * @property {string} [slackUserId]
   * @property {string} [reason]
   * @property {string} [idempotencyKey] Omit it for entries that must always be logged (unauthorized attempts).
   */

  /**
   * Idempotency key for an action on a line at a level: `line:level:action`.
   * @param {string|number} lineId
   * @param {string|number} levelId
   * @param {string} action One of AuditAction.
   * @returns {string}
   */
  const buildIdempotencyKey = (lineId, levelId, action) => `${lineId}:${levelId}:${action}`;

  /**
   * @param {AuditEntry} entry
   * @throws {Error} GPV_AUDIT_INVALID_ENTRY when action or channel is missing or unknown.
   */
  const validateEntry = (entry) => {
    const problems = [];
    if (!Object.values(AuditAction).includes(/** @type {any} */ (entry?.action))) {
      problems.push(`acción inválida: ${entry?.action}`);
    }
    if (!Object.values(AuditChannel).includes(/** @type {any} */ (entry?.channel))) {
      problems.push(`canal inválido: ${entry?.channel}`);
    }
    if (problems.length) {
      throw error.create({ name: 'GPV_AUDIT_INVALID_ENTRY', message: problems.join('; ') });
    }
  };

  /**
   * Returns key -> audit log id for the keys that already exist. One search for all keys.
   * @param {string[]} keys
   * @returns {Record<string, string>}
   */
  const findExistingKeys = (keys) => {
    /** @type {Record<string, string>} */
    const existing = {};
    if (!keys.length) return existing;

    const filters = keys.flatMap((key, i) => [
      ...(i ? ['OR'] : []),
      [AuditLog.IDEMPOTENCY_KEY, 'is', key],
    ]);
    search
      .create({ type: AuditLog.RECORD, filters, columns: [AuditLog.IDEMPOTENCY_KEY] })
      .run()
      .each((result) => {
        existing[String(result.getValue(AuditLog.IDEMPOTENCY_KEY))] = String(result.id);
        return true;
      });
    return existing;
  };

  /**
   * @param {AuditEntry} entry
   * @returns {string} New audit log id.
   */
  const createRecord = (entry) => {
    const rec = record.create({ type: AuditLog.RECORD });
    const values = {
      [AuditLog.ACTION]: listLib.getValueId(ActionList.ID, ActionList[entry.action]),
      [AuditLog.CHANNEL]: listLib.getValueId(ChannelList.ID, ChannelList[entry.channel]),
      [AuditLog.PROPOSAL]: entry.proposalId,
      [AuditLog.LINE]: entry.lineId,
      [AuditLog.LEVEL]: entry.levelId,
      [AuditLog.EMPLOYEE]: entry.employeeId,
      [AuditLog.SLACK_USER]: entry.slackUserId,
      [AuditLog.REASON]: entry.reason,
      [AuditLog.IDEMPOTENCY_KEY]: entry.idempotencyKey,
    };
    Object.entries(values).forEach(([fieldId, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        rec.setValue({ fieldId, value: /** @type {any} */ (value) });
      }
    });
    return String(rec.save());
  };

  /**
   * Writes several audit entries. Entries whose idempotency key already exists (in NetSuite or
   * earlier in the same batch) are not created again; their existing id is returned instead.
   * All entries are validated before anything is written.
   * @param {AuditEntry[]} entries
   * @returns {string[]} Audit log id per entry, in the same order.
   * @throws {Error} GPV_AUDIT_INVALID_ENTRY
   */
  const writeMany = (entries) => {
    entries.forEach(validateEntry);

    const keys = [...new Set(entries.map((e) => e.idempotencyKey).filter(Boolean))];
    const idsByKey = findExistingKeys(/** @type {string[]} */ (keys));

    return entries.map((entry) => {
      const key = entry.idempotencyKey;
      if (key && idsByKey[key]) return idsByKey[key];
      const id = createRecord(entry);
      if (key) idsByKey[key] = id;
      return id;
    });
  };

  /**
   * Writes one audit entry. See writeMany.
   * @param {AuditEntry} entry
   * @returns {string} Audit log id.
   * @throws {Error} GPV_AUDIT_INVALID_ENTRY
   */
  const write = (entry) => writeMany([entry])[0];

  return { AuditAction, AuditChannel, buildIdempotencyKey, write, writeMany };
});
