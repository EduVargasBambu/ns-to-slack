import search from 'N/search';
import listLib from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_list_lib';

jest.mock('N/search', () => ({
  create: jest.fn(() => ({
    run: () => ({
      each: (cb) =>
        [
          { id: 1, scriptid: 'VAL_GPV_APPROVE' },
          { id: 2, scriptid: 'VAL_GPV_DISCARD' },
        ].forEach((r) => cb({ id: r.id, getValue: () => r.scriptid })),
    }),
  })),
}));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

describe('getValueId', () => {
  it('resolves a value scriptid regardless of case and searches the list only once', () => {
    expect(listLib.getValueId('customlist_gpv_action', 'val_gpv_discard')).toBe('2');
    expect(listLib.getValueId('customlist_gpv_action', 'val_gpv_approve')).toBe('1');
    expect(search.create).toHaveBeenCalledTimes(1);
  });

  it('throws when the value does not exist', () => {
    expect(() => listLib.getValueId('customlist_gpv_action', 'val_gpv_nope')).toThrow(
      'No existe el valor val_gpv_nope',
    );
  });
});
