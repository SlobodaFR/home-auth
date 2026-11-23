import {
  createPinnedLookup,
  isPublicAddress,
  normalizeAddress,
} from './webhook-target-policy';

describe('isPublicAddress', () => {
  it.each([
    // 0.0.0.0/8
    '0.0.0.0',
    '0.255.255.255',
    // 10/8
    '10.0.0.1',
    '10.255.255.255',
    // 100.64/10
    '100.64.0.1',
    '100.127.255.255',
    // 127/8
    '127.0.0.1',
    '127.255.255.254',
    // 169.254/16 (cloud metadata)
    '169.254.169.254',
    // 172.16/12
    '172.16.0.1',
    '172.31.255.255',
    // 192.168/16
    '192.168.1.10',
    // 198.18/15
    '198.18.0.1',
    '198.19.255.255',
    // 224/4 and 240/4
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
    // IPv6
    '::',
    '::1',
    'fc00::1',
    'fdff:ffff::1',
    'fe80::1',
    'febf::1',
    'fe80::1%en0',
    // IPv4-mapped, normalised then rechecked (and ::ffff:0:0/96 is blocked anyway)
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    '::ffff:8.8.8.8',
    '0:0:0:0:0:ffff:7f00:1',
    // NAT64 and 6to4
    '64:ff9b::7f00:1',
    '64:ff9b::808:808',
    '2002:7f00:1::1',
    '2002:808:808::1',
    // brackets as found in a URL host
    '[::1]',
    '[::ffff:7f00:1]',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    // just outside the blocked ranges
    '9.255.255.255',
    '11.0.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '126.255.255.255',
    '128.0.0.1',
    '169.253.255.255',
    '169.255.0.1',
    '172.15.255.255',
    '172.32.0.1',
    '192.167.255.255',
    '192.169.0.1',
    '198.17.255.255',
    '198.20.0.1',
    '223.255.255.255',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    'fbff::1',
    'fec0::1',
  ])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it('rejects anything that is not an IP address', () => {
    expect(isPublicAddress('example.com')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
    expect(isPublicAddress('999.1.1.1')).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('turns IPv4-mapped IPv6 into the IPv4 address', () => {
    expect(normalizeAddress('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(normalizeAddress('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeAddress('[::ffff:a00:1]')).toBe('10.0.0.1');
  });

  it('leaves other addresses untouched (brackets and zone removed)', () => {
    expect(normalizeAddress('8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeAddress('[2606:4700:4700::1111]')).toBe(
      '2606:4700:4700::1111',
    );
    expect(normalizeAddress('fe80::1%en0')).toBe('fe80::1');
  });
});

describe('createPinnedLookup', () => {
  type Resolved = { address: string; family: number };
  const resolverFor =
    (addresses: Resolved[]) =>
    (
      _hostname: string,
      _options: object,
      callback: (error: Error | null, result: Resolved[]) => void,
    ) => {
      callback(null, addresses);
    };

  function call(
    lookup: ReturnType<typeof createPinnedLookup>,
    options: { all?: boolean },
  ) {
    return new Promise<{ error: Error | null; address: unknown }>((resolve) => {
      lookup('hook.example.com', options, (error, address) => {
        resolve({ error, address });
      });
    });
  }

  it('returns every validated address when node asks for all of them', async () => {
    const lookup = createPinnedLookup(
      resolverFor([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1::1', family: 6 },
      ]),
    );

    expect(await call(lookup, { all: true })).toEqual({
      error: null,
      address: [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1::1', family: 6 },
      ],
    });
  });

  it('returns the first validated address for a single-address lookup', async () => {
    const lookup = createPinnedLookup(
      resolverFor([{ address: '93.184.216.34', family: 4 }]),
    );

    expect(await call(lookup, {})).toEqual({
      error: null,
      address: '93.184.216.34',
    });
  });

  it('rejects the whole hostname if ONE resolved address is private', async () => {
    const lookup = createPinnedLookup(
      resolverFor([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ]),
    );

    for (const options of [{ all: true }, {}]) {
      const { error } = await call(lookup, options);
      expect(error?.message).toBe('Webhook target is not a public address');
    }
  });

  it('rejects a hostname resolving to an IPv4-mapped loopback', async () => {
    const lookup = createPinnedLookup(
      resolverFor([{ address: '::ffff:7f00:1', family: 6 }]),
    );

    expect((await call(lookup, { all: true })).error).toBeInstanceOf(Error);
  });

  it('rejects an empty resolution and propagates resolver errors', async () => {
    const empty = createPinnedLookup(resolverFor([]));
    expect((await call(empty, { all: true })).error).toBeInstanceOf(Error);

    const failing = createPinnedLookup((_hostname, _options, callback) => {
      callback(new Error('ENOTFOUND'), []);
    });
    expect((await call(failing, { all: true })).error?.message).toBe(
      'ENOTFOUND',
    );
  });

  it('always resolves with all: true so every address is checked', async () => {
    const seen: object[] = [];
    const lookup = createPinnedLookup((_hostname, options, callback) => {
      seen.push(options);
      callback(null, [{ address: '93.184.216.34', family: 4 }]);
    });

    await call(lookup, {});

    expect(seen).toEqual([expect.objectContaining({ all: true })]);
  });
});
