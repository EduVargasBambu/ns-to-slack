import https from 'N/https';
import slackClient from '../../src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_slack_client_lib';

jest.mock('N/https', () => ({
  post: jest.fn(),
  createSecureString: jest.fn(({ input }) => ({ secure: input })),
}));
jest.mock('N/error', () => ({
  create: ({ name, message }) => Object.assign(new Error(message), { name }),
}));

const reply = (code, body) => https.post.mockReturnValueOnce({ code, body: JSON.stringify(body) });

describe('postMessage', () => {
  beforeEach(() => https.post.mockReset());

  it('posts JSON with the bot token from API Secrets and returns channel and ts', () => {
    reply(200, { ok: true, channel: 'C1', ts: '123.456' });

    expect(slackClient.postMessage('C1', 'Hola')).toEqual({ channel: 'C1', ts: '123.456' });

    const { url, body, headers } = https.post.mock.calls[0][0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(JSON.parse(body)).toEqual({ channel: 'C1', text: 'Hola' });
    expect(headers.Authorization).toEqual({ secure: 'Bearer {custsecret_gpv_slack_bot_token}' });
  });

  it('throws with the Slack error code when ok is false', () => {
    reply(200, { ok: false, error: 'not_in_channel' });

    expect(() => slackClient.postMessage('C1', 'Hola')).toThrow('chat.postMessage: not_in_channel');
  });

  it('throws with the HTTP code when the body is not JSON', () => {
    https.post.mockReturnValueOnce({ code: 503, body: '<html>' });

    expect(() => slackClient.postMessage('C1', 'Hola')).toThrow('chat.postMessage: HTTP 503');
  });
});
