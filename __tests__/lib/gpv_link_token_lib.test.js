import { createHmac } from 'node:crypto';
import linkToken from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_link_token_lib';

jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

// N/crypto backed by Node's crypto: the API Secret id resolves to 'test-link-key'.
jest.mock('N/crypto', () => {
  const nodeCrypto = jest.requireActual('node:crypto');
  return {
    HashAlg: { SHA256: 'sha256' },
    Encoding: { UTF_8: 'utf8', HEX: 'hex' },
    createSecretKey: ({ secret }) => ({
      value: secret === 'custsecret_gpv_link_key' ? 'test-link-key' : 'wrong',
    }),
    createHmac: ({ key }) => {
      const hmac = nodeCrypto.createHmac('sha256', key.value);
      return {
        update: ({ input }) => hmac.update(input, 'utf8'),
        // NetSuite may return upper-case hex.
        digest: () => hmac.digest('hex').toUpperCase(),
      };
    },
  };
});

jest.mock(
  '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_slack_signature_lib',
  () => ({
    safeEqual: (a, b) => a === b,
  }),
);

const { create, verify, TTL_SECONDS } = linkToken;
const NOW = 1_800_000_000;

it('round-trips: a fresh token is valid and carries the employee', () => {
  expect(verify(create({ employeeId: '30', nowSeconds: NOW }), NOW)).toEqual({
    valid: true,
    employeeId: '30',
    reason: '',
  });
});

it('is valid on the last second and expired one second later', () => {
  const t = create({ employeeId: '30', nowSeconds: NOW });
  expect(verify(t, NOW + TTL_SECONDS).valid).toBe(true);
  expect(verify(t, NOW + TTL_SECONDS + 1)).toEqual({
    valid: false,
    employeeId: '',
    reason: 'caducado',
  });
});

it('rejects a token whose employee or expiry was changed', () => {
  const [, exp, sig] = create({ employeeId: '30', nowSeconds: NOW }).split('.');
  expect(verify(`31.${exp}.${sig}`, NOW).reason).toBe('firma inválida');
  expect(verify(`30.${Number(exp) + 999}.${sig}`, NOW).reason).toBe('firma inválida');
});

it.each(['', 'abc', '30.1', '30.x.ff', `30.${NOW}.${'g'.repeat(64)}`, undefined, null, 42])(
  'rejects malformed %p',
  (t) => {
    expect(verify(t, NOW)).toEqual({ valid: false, employeeId: '', reason: 'formato inválido' });
  },
);

it('emits lowercase hex and refuses a non-numeric employee', () => {
  expect(create({ employeeId: '30', nowSeconds: NOW })).toMatch(
    new RegExp(`^30\\.${NOW + TTL_SECONDS}\\.[0-9a-f]{64}$`),
  );
  expect(() => create({ employeeId: '30.1' })).toThrow('employeeId');
  expect(() => create({ employeeId: '' })).toThrow();
});

it('rejects an expiry with leading zeros reusing the canonical signature', () => {
  const [, exp, sig] = create({ employeeId: '30', nowSeconds: NOW }).split('.');
  expect(verify(`30.000${exp}.${sig}`, NOW)).toEqual({
    valid: false,
    employeeId: '',
    reason: 'firma inválida',
  });
});

it('signs with the link key secret', () => {
  const sig = create({ employeeId: '30', nowSeconds: NOW }).split('.')[2];
  expect(sig).toBe(
    createHmac('sha256', 'test-link-key')
      .update(`30.${NOW + TTL_SECONDS}`)
      .digest('hex'),
  );
});
