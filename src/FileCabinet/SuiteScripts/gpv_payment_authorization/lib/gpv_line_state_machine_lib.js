/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure state machine for a payment proposal line. No record or search access.
 */
define(['N/error'], (/** @type {typeof import('N/error')} */ error) => {
  /** @enum {string} */
  const LineStatus = Object.freeze({
    PENDING: 'PENDING',
    AUTHORIZED: 'AUTHORIZED',
    DISCARDED: 'DISCARDED',
    PAID: 'PAID',
    EXPIRED: 'EXPIRED',
  });

  /** @enum {string} */
  const LineAction = Object.freeze({
    APPROVE: 'approve',
    DISCARD: 'discard',
    // Weekly job: a line not authorized by Saturday restarts in next week's proposal.
    EXPIRE: 'expire',
  });

  /**
   * @typedef {object} LineState
   * @property {string} status One of LineStatus.
   * @property {number|null} level Order of the approval level the line waits for; null unless PENDING.
   */

  /**
   * Returns the state of a line after an approver or the weekly expiry acts on it. Does not mutate the input.
   *
   * @param {object} options
   * @param {LineState} options.state Current state of the line.
   * @param {string} options.action One of LineAction.
   * @param {number} options.levelCount Number of configured approval levels.
   * @returns {LineState}
   * @throws {error.SuiteScriptError} GPV_INVALID_ACTION if the action is unknown.
   * @throws {error.SuiteScriptError} GPV_INVALID_TRANSITION if the line is not pending.
   * @throws {error.SuiteScriptError} GPV_INVALID_STATE if a pending line has no valid level.
   */
  const applyAction = ({ state, action, levelCount }) => {
    if (!(/** @type {string[]} */ (Object.values(LineAction)).includes(action))) {
      throw error.create({ name: 'GPV_INVALID_ACTION', message: `Unknown action: ${action}` });
    }
    if (state.status !== LineStatus.PENDING) {
      throw error.create({
        name: 'GPV_INVALID_TRANSITION',
        message: `Cannot ${action} a line in status ${state.status}`,
      });
    }
    const { level } = state;
    if (level === null || level < 1 || level > levelCount) {
      throw error.create({
        name: 'GPV_INVALID_STATE',
        message: `Pending line has level ${level}, expected 1 to ${levelCount}`,
      });
    }
    if (action === LineAction.DISCARD) {
      return { status: LineStatus.DISCARDED, level: null };
    }
    if (action === LineAction.EXPIRE) {
      return { status: LineStatus.EXPIRED, level: null };
    }
    return level < levelCount
      ? { status: LineStatus.PENDING, level: level + 1 }
      : { status: LineStatus.AUTHORIZED, level: null };
  };

  return { LineStatus, LineAction, applyAction };
});
