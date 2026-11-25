import { resolvePostLogoutRedirect } from './post-logout-redirect';

const REGISTERED = [
  'https://app.sloboda.fr/auth/callback',
  'http://localhost:5173/cb',
];

describe('resolvePostLogoutRedirect', () => {
  it('accepts any path of a registered origin', () => {
    expect(
      resolvePostLogoutRedirect('https://app.sloboda.fr/bye?x=1', REGISTERED),
    ).toBe('https://app.sloboda.fr/bye?x=1');
    expect(
      resolvePostLogoutRedirect('http://localhost:5173/', REGISTERED),
    ).toBe('http://localhost:5173/');
  });

  it('normalises through the WHATWG parser (default port, case)', () => {
    expect(
      resolvePostLogoutRedirect('HTTPS://APP.sloboda.fr:443/x', REGISTERED),
    ).toBe('https://app.sloboda.fr/x');
  });

  it('adds state encoded, replacing one already in the URI', () => {
    expect(
      resolvePostLogoutRedirect(
        'https://app.sloboda.fr/bye?state=evil&a=1',
        REGISTERED,
        'a b&c',
      ),
    ).toBe('https://app.sloboda.fr/bye?state=a+b%26c&a=1');
  });

  it('does not add state when absent', () => {
    expect(
      resolvePostLogoutRedirect('https://app.sloboda.fr/bye', REGISTERED),
    ).toBe('https://app.sloboda.fr/bye');
  });

  it.each([
    ['another origin', 'https://evil.example/'],
    ['another scheme', 'http://app.sloboda.fr/'],
    ['another port', 'https://app.sloboda.fr:8443/'],
    ['sub-domain', 'https://x.app.sloboda.fr/'],
    ['suffix host', 'https://app.sloboda.fr.evil.example/'],
    ['userinfo', 'https://user:pw@app.sloboda.fr/'],
    ['user only', 'https://user@app.sloboda.fr/'],
    ['backslash trick', 'https://evil.example\\@app.sloboda.fr/'],
    ['fragment', 'https://app.sloboda.fr/#x'],
    ['empty fragment', 'https://app.sloboda.fr/#'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,x'],
    ['relative', '/bye'],
    ['protocol relative', '//app.sloboda.fr/bye'],
    ['empty', ''],
    ['garbage', 'not a url'],
    ['too long', `https://app.sloboda.fr/${'a'.repeat(2048)}`],
  ])('refuses %s', (_label, candidate) => {
    expect(resolvePostLogoutRedirect(candidate, REGISTERED)).toBeNull();
  });

  it('strips tab and newline like the browser does, never smuggling a header', () => {
    const result = resolvePostLogoutRedirect(
      'https://app.sloboda.fr/a\r\nSet-Cookie:x',
      REGISTERED,
    );
    expect(result).not.toMatch(/[\r\n]/);
  });

  it('never matches a custom-scheme (null origin) registration', () => {
    expect(resolvePostLogoutRedirect('myapp://cb', ['myapp://cb'])).toBeNull();
    expect(
      resolvePostLogoutRedirect('https://app.sloboda.fr/', ['myapp://cb']),
    ).toBeNull();
  });

  it('ignores an unparsable registered URI', () => {
    expect(
      resolvePostLogoutRedirect('https://app.sloboda.fr/', [
        'nope',
        ...REGISTERED,
      ]),
    ).toBe('https://app.sloboda.fr/');
  });
});
