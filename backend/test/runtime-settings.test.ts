import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuntimeService } from '../src/admin/runtime.service';

describe('live messenger webhook rotation', () => {
  it('registers Rubika message and inline-click endpoints on the freshly saved bot token', async () => {
    const env = {
      base: process.env.PUBLIC_API_URL,
      token: process.env.RUBIKA_BOT_TOKEN,
      secret: process.env.RUBIKA_WEBHOOK_SECRET,
      fetch: globalThis.fetch,
    };
    const requests: { url: string; body: Record<string, string> }[] = [];
    process.env.PUBLIC_API_URL = 'https://api.example.test/';
    process.env.RUBIKA_BOT_TOKEN = 'fresh-token';
    process.env.RUBIKA_WEBHOOK_SECRET = 'test-secret-0123456789';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, string> });
      return new Response(JSON.stringify({ status: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    try {
      const runtime = new RuntimeService({ reload() {} } as never);
      const result = await runtime.apply(['RUBIKA_BOT_TOKEN']);
      assert.equal(requests.length, 2);
      assert.ok(requests.every(request => request.url.includes('/v3/fresh-token/updateBotEndpoints')));
      assert.deepEqual(requests.map(request => request.body.type), ['ReceiveUpdate', 'ReceiveInlineMessage']);
      assert.equal(requests[0].body.url, 'https://api.example.test/rubika/webhook/test-secret-0123456789');
      assert.equal(requests[1].body.url, 'https://api.example.test/rubika/inline-webhook/test-secret-0123456789');
      assert.deepEqual(result.warnings, []);
    } finally {
      globalThis.fetch = env.fetch;
      if (env.base === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = env.base;
      if (env.token === undefined) delete process.env.RUBIKA_BOT_TOKEN; else process.env.RUBIKA_BOT_TOKEN = env.token;
      if (env.secret === undefined) delete process.env.RUBIKA_WEBHOOK_SECRET; else process.env.RUBIKA_WEBHOOK_SECRET = env.secret;
    }
  });
});
