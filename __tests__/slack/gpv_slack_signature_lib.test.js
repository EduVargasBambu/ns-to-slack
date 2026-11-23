import { createHmac } from 'node:crypto';
import signature from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_slack_signature_lib';

const SECRET = 'test-signing-secret';

// N/crypto backed by Node's crypto: the API Secret id resolves to SECRET.
jest.mock('N/crypto', () => {
  const nodeCrypto = jest.requireActual('node:crypto');
  return {
    HashAlg: { SHA256: 'sha256' },
    Encoding: { UTF_8: 'utf8', HEX: 'hex' },
    createSecretKey: ({ secret }) => ({
      value: secret === 'custsecret_gpv_slack_signing_secret' ? 'test-signing-secret' : 'wrong',
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

const { getHeader, isFresh, safeEqual, verify } = signature;

const NOW = 1_700_000_000;
const BODY = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
const slackSign = (timestamp, body, secret = SECRET) =>
  `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
const headers = (timestamp, sig) => ({
  'X-Slack-Request-Timestamp': String(timestamp),
  'X-Slack-Signature': sig,
});

describe('verify', () => {
  it('accepts a request signed with the signing secret', () => {
    expect(
      verify({ headers: headers(NOW, slackSign(NOW, BODY)), body: BODY, nowSeconds: NOW }),
    ).toEqual({
      valid: true,
      reason: '',
    });
  });

  it('reads headers in any case', () => {
    const h = {
      'x-slack-request-timestamp': String(NOW),
      'x-slack-signature': slackSign(NOW, BODY),
    };
    expect(verify({ headers: h, body: BODY, nowSeconds: NOW }).valid).toBe(true);
  });

  it.each([
    ['another secret', headers(NOW, slackSign(NOW, BODY, 'other')), BODY, 'firma inválida'],
    ['a tampered body', headers(NOW, slackSign(NOW, BODY)), `${BODY}x`, 'firma inválida'],
    ['an old timestamp', headers(NOW - 301, slackSign(NOW - 301, BODY)), BODY, 'timestamp vencido'],
    ['missing headers', {}, BODY, 'faltan los encabezados de Slack'],
    ['an empty body', headers(NOW, slackSign(NOW, '')), '', 'cuerpo vacío'],
  ])('rejects %s', (_label, h, body, reason) => {
    expect(verify({ headers: h, body, nowSeconds: NOW })).toEqual({ valid: false, reason });
  });
});

describe('helpers', () => {
  it('getHeader returns empty when absent', () => {
    expect(getHeader({ A: '1' }, 'b')).toBe('');
    expect(getHeader(undefined, 'b')).toBe('');
  });

  it.each([
    [String(NOW), true],
    [String(NOW + 300), true],
    [String(NOW - 301), false],
    ['abc', false],
    ['', false],
  ])('isFresh(%p) -> %p', (ts, expected) => {
    expect(isFresh(ts, NOW)).toBe(expected);
  });

  it('safeEqual compares whole strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
});
