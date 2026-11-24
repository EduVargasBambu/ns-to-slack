import legacy from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_legacy_lib';
import stateMachine from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_line_state_machine_lib';

jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const { getStartingState, getLevelsToClear } = legacy;
const { LineStatus } = stateMachine;

// Values come from the vendor bill approval checkboxes ordered by level.
const APPROVED = true;
const EMPTY = false;

describe('getStartingState', () => {
  it('starts at level 1 when there are no previous approvals', () => {
    expect(getStartingState([EMPTY, EMPTY, EMPTY])).toEqual({
      status: LineStatus.PENDING,
      level: 1,
    });
  });

  it('starts at level 2 when only the CFO approved', () => {
    expect(getStartingState([APPROVED, EMPTY, EMPTY])).toEqual({
      status: LineStatus.PENDING,
      level: 2,
    });
  });

  it('starts at level 3 when the CFO and CEO 1 approved', () => {
    expect(getStartingState([APPROVED, APPROVED, EMPTY])).toEqual({
      status: LineStatus.PENDING,
      level: 3,
    });
  });

  it('starts authorized when every level already approved', () => {
    expect(getStartingState([APPROVED, APPROVED, APPROVED])).toEqual({
      status: LineStatus.AUTHORIZED,
      level: null,
    });
  });

  describe('approvals out of order restart the chain at level 1', () => {
    it.each([
      ['level 2 only', [EMPTY, APPROVED, EMPTY]],
      ['level 3 only', [EMPTY, EMPTY, APPROVED]],
      ['levels 2 and 3, skipping level 1', [EMPTY, APPROVED, APPROVED]],
    ])('%s', (_label, values) => {
      expect(getStartingState(values)).toEqual({ status: LineStatus.PENDING, level: 1 });
    });
  });

  describe('a level 1 approval is permanent, so out of order restarts at level 2', () => {
    it.each([
      ['levels 1 and 3, skipping 2', [APPROVED, EMPTY, APPROVED]],
      ['levels 1, 2 and 4, skipping 3', [APPROVED, APPROVED, EMPTY, APPROVED]],
    ])('%s', (_label, values) => {
      expect(getStartingState(values)).toEqual({ status: LineStatus.PENDING, level: 2 });
    });
  });

  it.each([null, undefined, '', 'F', '1', 1])('treats %p as not approved', (value) => {
    expect(getStartingState([value, EMPTY, EMPTY])).toEqual({
      status: LineStatus.PENDING,
      level: 1,
    });
  });

  it("treats the search value 'T' as approved", () => {
    expect(getStartingState(['T', EMPTY, EMPTY])).toEqual({ status: LineStatus.PENDING, level: 2 });
  });

  it('follows the number of configured levels', () => {
    expect(getStartingState([APPROVED, APPROVED])).toEqual({
      status: LineStatus.AUTHORIZED,
      level: null,
    });
  });
});

// Out-of-order approvals are discarded so the bill shows up again for each level.
describe('getLevelsToClear', () => {
  it.each([
    ['no approvals', [EMPTY, EMPTY, EMPTY]],
    ['CFO only', [APPROVED, EMPTY, EMPTY]],
    ['CFO and CEO 1', [APPROVED, APPROVED, EMPTY]],
    ['all levels', [APPROVED, APPROVED, APPROVED]],
  ])('clears nothing when approvals are in order: %s', (_label, values) => {
    expect(getLevelsToClear(values)).toEqual([]);
  });

  it.each([
    ['level 2 only', [EMPTY, APPROVED, EMPTY], [2]],
    ['level 3 only', [EMPTY, EMPTY, APPROVED], [3]],
    ['levels 2 and 3, skipping level 1', [EMPTY, APPROVED, APPROVED], [2, 3]],
    ['levels 1 and 3: level 1 is kept', [APPROVED, EMPTY, APPROVED], [3]],
    ['levels 1, 2 and 4: level 1 is kept', [APPROVED, APPROVED, EMPTY, APPROVED], [2, 4]],
  ])(
    'clears every approved level but level 1 when out of order: %s',
    (_label, values, expected) => {
      expect(getLevelsToClear(values)).toEqual(expected);
    },
  );
});
