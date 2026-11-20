import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { deliverWebhook } from './secure-webhook-request';

const BODY = JSON.stringify({ userId: 'u1' });
const HEADERS = { 'Content-Type': 'application/json' };

describe('deliverWebhook: connect-time policy', () => {
  // Nothing may leave the machine for a non-public target: a throwing request proves it.
  const neverConnect = () => {
    throw new Error('a connection was attempted');
  };

  it.each([
    'https://127.0.0.1/hook',
    'https://127.0.0.1:8443/hook',
    'https://[::1]/hook',
    'https://[::ffff:7f00:1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
    'https://10.1.2.3/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://2130706433/hook', // decimal form of 127.0.0.1, normalised by the URL parser
    'https://0x7f.1/hook',
    'http://192.168.1.1/hook',
  ])('refuses the IP literal %s without connecting', async (url) => {
    await expect(
      deliverWebhook(url, BODY, HEADERS, { request: neverConnect }),
    ).rejects.toThrow('Webhook target is not a public address');
  });

  it.each([
    [[{ address: '10.0.0.8', family: 4 }]],
    [
      [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    ],
    [[{ address: '::ffff:7f00:1', family: 6 }]],
  ])(
    'refuses a hostname resolving to non-public addresses (real connection path)',
    async (addresses) => {
      await expect(
        deliverWebhook('https://internal.example.com/hook', BODY, HEADERS, {
          lookup: (_hostname, _options, callback) => {
            callback(null, addresses);
          },
          timeoutMs: 1000,
        }),
      ).rejects.toThrow('Webhook target is not a public address');
    },
  );

  it('refuses localhost through the real resolver', async () => {
    await expect(
      deliverWebhook('https://localhost/hook', BODY, HEADERS, {
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('Webhook target is not a public address');
  });

  it('hands the pinned, validated lookup to the connection', async () => {
    let lookupHandedOver: unknown;
    const resolved: string[] = [];
    await expect(
      deliverWebhook('https://hook.example.com/hook', BODY, HEADERS, {
        lookup: (_hostname, _options, callback) => {
          resolved.push('resolved');
          callback(null, [
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.8', family: 4 },
          ]);
        },
        request: (_url, options) => {
          lookupHandedOver = options.lookup;
          // Behave like net: ask the lookup, which must reject the whole hostname.
          return new Promise((_resolve, reject) => {
            (
              options.lookup as (
                host: string,
                opts: object,
                cb: (error: Error | null) => void,
              ) => void
            )('hook.example.com', { all: true }, (error) => {
              reject(error ?? new Error('lookup accepted a private address'));
            });
          });
        },
      }),
    ).rejects.toThrow('Webhook target is not a public address');
    expect(lookupHandedOver).toBeTypeOf('function');
    expect(resolved).toEqual(['resolved']);
  });
});

describe('deliverWebhook: against a real local server', () => {
  let server: Server;
  let base: string;
  let hits: { url: string; body: string; headers: Record<string, unknown> }[];
  const allowLoopback = { isPublicAddress: () => true };

  beforeEach(async () => {
    hits = [];
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        hits.push({ url: req.url ?? '', body, headers: req.headers });
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: '/target' });
          res.end();
        } else if (req.url === '/hang') {
          // never answers
        } else if (req.url === '/drip') {
          res.writeHead(200);
          res.write('x');
          // headers sent, body never finished
        } else if (req.url === '/fail') {
          res.writeHead(500);
          res.end();
        } else {
          res.writeHead(204);
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('POSTs the exact body and headers and accepts a 2xx', async () => {
    await deliverWebhook(`${base}/ok`, BODY, HEADERS, allowLoopback);

    expect(hits).toHaveLength(1);
    expect(hits[0].body).toBe(BODY);
    expect(hits[0].headers['content-type']).toBe('application/json');
    expect(hits[0].headers['content-length']).toBe(String(BODY.length));
  });

  it('does NOT follow a 302 and reports the status', async () => {
    await expect(
      deliverWebhook(`${base}/redirect`, BODY, HEADERS, allowLoopback),
    ).rejects.toThrow('Webhook request failed (302)');

    expect(hits.map((hit) => hit.url)).toEqual(['/redirect']);
  });

  it('reports a non-2xx status without retrying', async () => {
    await expect(
      deliverWebhook(`${base}/fail`, BODY, HEADERS, allowLoopback),
    ).rejects.toThrow('Webhook request failed (500)');

    expect(hits).toHaveLength(1);
  });

  it('gives up after the total deadline when the server never answers', async () => {
    const started = Date.now();

    await expect(
      deliverWebhook(`${base}/hang`, BODY, HEADERS, {
        ...allowLoopback,
        timeoutMs: 150,
      }),
    ).rejects.toThrow('Webhook request timed out');

    expect(Date.now() - started).toBeLessThan(1000);
    expect(hits).toHaveLength(1);
  });

  it('defaults to a 2 s total deadline', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      await deliverWebhook(`${base}/ok`, BODY, HEADERS, allowLoopback);
      expect(spy).toHaveBeenCalledWith(2000);
    } finally {
      spy.mockRestore();
    }
  });

  it('applies the deadline to the whole exchange, not only to the connection', async () => {
    // The 200 arrives but a 2xx is enough: the body is not awaited, the socket is destroyed.
    await expect(
      deliverWebhook(`${base}/drip`, BODY, HEADERS, {
        ...allowLoopback,
        timeoutMs: 150,
      }),
    ).resolves.toBeUndefined();
  });

  it('reports a refused connection', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, '127.0.0.1', resolve),
    );
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    await expect(
      deliverWebhook(`http://127.0.0.1:${String(port)}/x`, BODY, HEADERS, {
        ...allowLoopback,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
