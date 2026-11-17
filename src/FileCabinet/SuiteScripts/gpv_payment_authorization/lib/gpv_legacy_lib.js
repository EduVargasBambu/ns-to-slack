/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure rules for approvals recorded by the previous flow (custbody11/10/9).
 * Approvals only count when they form an unbroken chain from level 1; otherwise the
 * bill starts over at level 1 and every out-of-order approval is cleared.
 */
define(['./gpv_constants_lib', './gpv_line_state_machine_lib'], (constants, stateMachine) => {
  const { LineStatus } = stateMachine;

  /**
   * @param {unknown} value Raw value of a legacy approval field.
   * @returns {boolean}
   */
  const isApproved = (value) =>
    value !== null && value !== undefined && String(value) === constants.LEGACY_APPROVED_VALUE;

  /**
   * @param {unknown[]} legacyValues Legacy field values ordered by level (index 0 = level 1).
   * @returns {{ approved: boolean[], inOrderCount: number, hasGap: boolean }}
   */
  const analyze = (legacyValues) => {
    const approved = legacyValues.map(isApproved);
    const firstMissing = approved.indexOf(false);
    const inOrderCount = firstMissing === -1 ? approved.length : firstMissing;
    const hasGap = approved.slice(inOrderCount).includes(true);
    return { approved, inOrderCount, hasGap };
  };

  /**
   * State a new proposal line starts in, given the bill's legacy approvals.
   *
   * @param {unknown[]} legacyValues Legacy field values ordered by level (index 0 = level 1).
   * @returns {{ status: string, level: number|null }}
   */
  const getStartingState = (legacyValues) => {
    const { inOrderCount, hasGap } = analyze(legacyValues);
    if (hasGap) {
      return { status: LineStatus.PENDING, level: 1 };
    }
    return inOrderCount === legacyValues.length
      ? { status: LineStatus.AUTHORIZED, level: null }
      : { status: LineStatus.PENDING, level: inOrderCount + 1 };
  };

  /**
   * Levels whose legacy field must be cleared so the bill is approved again at each level.
   *
   * @param {unknown[]} legacyValues Legacy field values ordered by level (index 0 = level 1).
   * @returns {number[]} Level orders (1-based), ascending. Empty when approvals are in order.
   */
  const getLevelsToClear = (legacyValues) => {
    const { approved, hasGap } = analyze(legacyValues);
    if (!hasGap) {
      return [];
    }
    return approved.flatMap((isLevelApproved, index) => (isLevelApproved ? [index + 1] : []));
  };

  return { getStartingState, getLevelsToClear };
});
