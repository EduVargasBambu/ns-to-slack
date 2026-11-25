/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure decision of what an approve or discard does to one proposal line.
 * The level and the approver come from the line and the configured levels, never from the caller.
 */
define(['./gpv_line_state_machine_lib', './gpv_constants_lib'], (stateMachine, constants) => {
  const { LineStatus, LineAction } = stateMachine;
  const { PERMANENT_APPROVAL_LEVEL } = constants;

  /** @enum {string} */
  const Outcome = Object.freeze({
    /** Approved; the line now waits for the next level. */
    ADVANCED: 'ADVANCED',
    /** Approved at the last level; the bill can be paid. */
    AUTHORIZED: 'AUTHORIZED',
    DISCARDED: 'DISCARDED',
    /** Already acted on (double click, the other channel, the weekly expiry): nothing to do. */
    NOT_PENDING: 'NOT_PENDING',
    /** Not attempted: the caller ran out of governance; ask again for these lines. */
    NOT_PROCESSED: 'NOT_PROCESSED',
    /** The employee is not the approver of the line's level: logged, nothing changes. */
    UNAUTHORIZED: 'UNAUTHORIZED',
  });

  /**
   * @typedef {object} LinePlan
   * @property {string} outcome One of Outcome.
   * @property {GpvLevel|null} level Level the line was waiting for.
   * @property {{ status: string, level: GpvLevel|null }} [next] New line state (only when it changes).
   * @property {string|null} [billStatus] New bill authorization status (LineStatus), null to keep it.
   * @property {Record<string, boolean>} [checkboxes] Bill approval checkboxes to set.
   */

  /**
   * @param {object} options
   * @param {{ status: string, levelId: string }} options.line status is a LineStatus.
   * @param {GpvLevel[]} options.levels Validated, sorted by order.
   * @param {string} options.employeeId Authenticated employee (NetSuite session or mapped Slack user).
   * @param {string} options.action LineAction.APPROVE or LineAction.DISCARD.
   * @returns {LinePlan}
   */
  const planLineAction = ({ line, levels, employeeId, action }) => {
    const level = levels.find((l) => l.id === line.levelId) || null;
    if (line.status !== LineStatus.PENDING || !level) {
      return { outcome: Outcome.NOT_PENDING, level };
    }
    const allowed = [level.approverId, level.substituteId].filter(Boolean);
    if (!employeeId || !allowed.includes(String(employeeId))) {
      return { outcome: Outcome.UNAUTHORIZED, level };
    }

    const next = stateMachine.applyAction({
      state: { status: LineStatus.PENDING, level: level.order },
      action,
      levelCount: levels.length,
    });
    const nextLevel = next.level === null ? null : levels[next.level - 1];

    if (action === LineAction.DISCARD) {
      // A discarded bill starts over if it comes back (decided 18 nov), but keeps the
      // Director's approval (decided 24 nov), so it returns at level 2 when the Director approved.
      return {
        outcome: Outcome.DISCARDED,
        level,
        next: { status: next.status, level: null },
        billStatus: LineStatus.DISCARDED,
        checkboxes: Object.fromEntries(
          levels
            .filter((l) => l.order !== PERMANENT_APPROVAL_LEVEL)
            .map((l) => [l.approvalField, false]),
        ),
      };
    }
    const authorized = next.status === LineStatus.AUTHORIZED;
    return {
      outcome: authorized ? Outcome.AUTHORIZED : Outcome.ADVANCED,
      level,
      next: { status: next.status, level: nextLevel },
      // The bill is already PENDING while it advances; it only changes when authorized.
      billStatus: authorized ? LineStatus.AUTHORIZED : null,
      checkboxes: { [level.approvalField]: true },
    };
  };

  /**
   * Whether the employee approves by external link (approver or substitute of such a level).
   * @param {GpvLevel[]} levels
   * @param {string} employeeId
   * @returns {boolean}
   */
  const isExternalLinkEmployee = (levels, employeeId) =>
    employeeId !== '' &&
    levels.some(
      (l) => l.externalLink && (l.approverId === employeeId || l.substituteId === employeeId),
    );

  return { Outcome, planLineAction, isExternalLinkEmployee };
});
