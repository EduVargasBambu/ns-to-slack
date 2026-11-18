import stateMachine from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_line_state_machine_lib';

// N/error is a platform module: reproduce its observable contract (name + message).
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const { LineStatus, LineAction, applyAction } = stateMachine;

const pendingAt = (level) => ({ status: LineStatus.PENDING, level });

const catchError = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('Expected function to throw');
};

describe('applyAction: approve', () => {
  it('moves a line pending at level 1 to level 2', () => {
    const next = applyAction({ state: pendingAt(1), action: LineAction.APPROVE, levelCount: 3 });
    expect(next).toEqual(pendingAt(2));
  });

  it('moves a line pending at level 2 to level 3', () => {
    const next = applyAction({ state: pendingAt(2), action: LineAction.APPROVE, levelCount: 3 });
    expect(next).toEqual(pendingAt(3));
  });

  it('authorizes a line approved at the last level', () => {
    const next = applyAction({ state: pendingAt(3), action: LineAction.APPROVE, levelCount: 3 });
    expect(next).toEqual({ status: LineStatus.AUTHORIZED, level: null });
  });

  it('uses the configured number of levels, not a fixed three', () => {
    const next = applyAction({ state: pendingAt(2), action: LineAction.APPROVE, levelCount: 2 });
    expect(next).toEqual({ status: LineStatus.AUTHORIZED, level: null });
  });
});

describe('applyAction: discard', () => {
  it.each([1, 2, 3])('discards a line pending at level %i', (level) => {
    const next = applyAction({
      state: pendingAt(level),
      action: LineAction.DISCARD,
      levelCount: 3,
    });
    expect(next).toEqual({ status: LineStatus.DISCARDED, level: null });
  });
});

describe('applyAction: expire', () => {
  it.each([1, 2, 3])('expires a line still pending at level %i', (level) => {
    const next = applyAction({ state: pendingAt(level), action: LineAction.EXPIRE, levelCount: 3 });
    expect(next).toEqual({ status: LineStatus.EXPIRED, level: null });
  });
});

describe('applyAction: invalid transitions', () => {
  it.each([
    ['approve', LineStatus.AUTHORIZED],
    ['approve', LineStatus.DISCARDED],
    ['approve', LineStatus.PAID],
    ['discard', LineStatus.AUTHORIZED],
    ['discard', LineStatus.DISCARDED],
    ['discard', LineStatus.PAID],
    ['approve', LineStatus.EXPIRED],
    ['discard', LineStatus.EXPIRED],
    ['expire', LineStatus.AUTHORIZED],
    ['expire', LineStatus.DISCARDED],
    ['expire', LineStatus.PAID],
    ['expire', LineStatus.EXPIRED],
  ])('rejects %s on a %s line', (action, status) => {
    const err = catchError(() =>
      applyAction({ state: { status, level: null }, action, levelCount: 3 }),
    );
    expect(err.name).toBe('GPV_INVALID_TRANSITION');
  });

  it('rejects an unknown action', () => {
    const err = catchError(() =>
      applyAction({ state: pendingAt(1), action: 'pay', levelCount: 3 }),
    );
    expect(err.name).toBe('GPV_INVALID_ACTION');
  });

  // Corrupt data or levels reconfigured mid-flight must never authorize a bill by accident.
  it.each([null, 0, 4])('rejects a pending line whose level is %p with 3 levels', (level) => {
    const err = catchError(() =>
      applyAction({
        state: { status: LineStatus.PENDING, level },
        action: LineAction.APPROVE,
        levelCount: 3,
      }),
    );
    expect(err.name).toBe('GPV_INVALID_STATE');
  });
});

it('does not mutate the given state', () => {
  const state = pendingAt(1);
  applyAction({ state, action: LineAction.APPROVE, levelCount: 3 });
  expect(state).toEqual(pendingAt(1));
});
