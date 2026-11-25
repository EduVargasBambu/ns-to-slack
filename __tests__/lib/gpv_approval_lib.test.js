import approval from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_lib';
import stateMachine from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_line_state_machine_lib';

jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const { Outcome, planLineAction, isExternalLinkEmployee } = approval;
const { LineStatus, LineAction } = stateMachine;

const level = (order, id, field, approverId, substituteId = '') => ({
  id,
  name: `L${order}`,
  order,
  approvalField: field,
  approverId,
  substituteId,
});
const LEVELS = [
  level(1, '11', 'custbody_gpv_dir_approval', '100', '900'),
  level(2, '12', 'custbody_gpv_cfo_approval', '200'),
  level(3, '13', 'custbody_gpv_ceo1_approval', '300'),
  level(4, '14', 'custbody_gpv_ceo2_approval', '400'),
];
const pendingAt = (levelId) => ({ status: LineStatus.PENDING, levelId });
const plan = (line, employeeId, action = LineAction.APPROVE) =>
  planLineAction({ line, levels: LEVELS, employeeId, action });

describe('approve', () => {
  it('advances to the next level and checks the level box', () => {
    expect(plan(pendingAt('11'), '100')).toEqual({
      outcome: Outcome.ADVANCED,
      level: LEVELS[0],
      next: { status: LineStatus.PENDING, level: LEVELS[1] },
      billStatus: null,
      checkboxes: { custbody_gpv_dir_approval: true },
    });
  });

  it('authorizes the bill at the last level', () => {
    expect(plan(pendingAt('14'), '400')).toEqual({
      outcome: Outcome.AUTHORIZED,
      level: LEVELS[3],
      next: { status: LineStatus.AUTHORIZED, level: null },
      billStatus: LineStatus.AUTHORIZED,
      checkboxes: { custbody_gpv_ceo2_approval: true },
    });
  });

  it('lets the substitute approve', () => {
    expect(plan(pendingAt('11'), '900').outcome).toBe(Outcome.ADVANCED);
  });

  it('accepts a numeric employee id', () => {
    expect(plan(pendingAt('12'), 200).outcome).toBe(Outcome.ADVANCED);
  });
});

describe('discard', () => {
  it('discards, frees the bill and clears every checkbox but the Director', () => {
    expect(plan(pendingAt('12'), '200', LineAction.DISCARD)).toEqual({
      outcome: Outcome.DISCARDED,
      level: LEVELS[1],
      next: { status: LineStatus.DISCARDED, level: null },
      billStatus: LineStatus.DISCARDED,
      checkboxes: {
        custbody_gpv_cfo_approval: false,
        custbody_gpv_ceo1_approval: false,
        custbody_gpv_ceo2_approval: false,
      },
    });
  });
});

describe('rejections', () => {
  it.each([
    ['the approver of another level', '200'],
    ['an unknown employee', '999'],
    ['an empty employee', ''],
  ])('is unauthorized for %s', (_label, employeeId) => {
    expect(plan(pendingAt('11'), employeeId)).toEqual({
      outcome: Outcome.UNAUTHORIZED,
      level: LEVELS[0],
    });
  });

  it('does not let an empty employee match a level without substitute', () => {
    expect(plan(pendingAt('12'), '').outcome).toBe(Outcome.UNAUTHORIZED);
  });

  it.each([
    ['already authorized', { status: LineStatus.AUTHORIZED, levelId: '' }],
    ['discarded', { status: LineStatus.DISCARDED, levelId: '' }],
    ['expired', { status: LineStatus.EXPIRED, levelId: '' }],
    ['pending at an unknown level', pendingAt('99')],
  ])('does nothing when the line is %s', (_label, line) => {
    expect(plan(line, '100').outcome).toBe(Outcome.NOT_PENDING);
  });
});

describe('isExternalLinkEmployee', () => {
  const levels = [
    { id: '1', order: 1, approverId: '10', substituteId: '', externalLink: false },
    { id: '3', order: 3, approverId: '30', substituteId: '31', externalLink: true },
  ];
  it('is true for the approver and the substitute of a level with the checkbox', () => {
    expect(isExternalLinkEmployee(levels, '30')).toBe(true);
    expect(isExternalLinkEmployee(levels, '31')).toBe(true);
  });
  it('is false for approvers of other levels and unknown employees', () => {
    expect(isExternalLinkEmployee(levels, '10')).toBe(false);
    expect(isExternalLinkEmployee(levels, '99')).toBe(false);
    expect(isExternalLinkEmployee(levels, '')).toBe(false);
  });
});
