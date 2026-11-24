/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pure rules for approvals already checked on the bill (custbody_gpv_*_approval)
 * when it enters a proposal, e.g. a Director who approved before the meeting.
 * Approvals only count when they form an unbroken chain from level 1; otherwise every
 * out-of-order approval is cleared and the bill starts over at level 1, or at level 2 when
 * level 1 approved (that approval is permanent, see PERMANENT_APPROVAL_LEVEL).
 */
define(['./gpv_line_state_machine_lib', './gpv_constants_lib'], (stateMachine, constants) => {
  const { LineStatus } = stateMachine;
  // shortcut: the rules assume the permanent level is level 1; revisit if it ever moves.
  const KEEP = constants.PERMANENT_APPROVAL_LEVEL - 1;

  /**
   * @param {unknown} value Raw checkbox value: true from N/record, true or 'T' from N/search.
   * @returns {boolean}
   */
  const isApproved = (value) => value === true || value === 'T';

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
      return { status: LineStatus.PENDING, level: isApproved(legacyValues[KEEP]) ? 2 : 1 };
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
    return approved.flatMap((isLevelApproved, index) =>
      isLevelApproved && index !== KEEP ? [index + 1] : [],
    );
  };

  return { getStartingState, getLevelsToClear };
});
