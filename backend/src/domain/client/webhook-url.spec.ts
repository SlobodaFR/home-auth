import { assertSecureWebhookUrl, maskWebhookUrl } from './webhook-url';

describe('assertSecureWebhookUrl', () => {
  it.each([
    'https://budget.example.com/internal/session-revoked',
    'https://budget.example.com:8443/hook',
    // Query string tolerated during the transition (apps still read ?secret=).
    'https://budget.example.com/hook?secret=abc',
  ])('accepts %s', (url) => {
    expect(() => assertSecureWebhookUrl(url)).not.toThrow();
  });

  it.each([
    ['http://budget.example.com/hook', 'Webhook URL must use https'],
    ['ftp://budget.example.com/hook', 'Webhook URL must use https'],
    ['javascript:alert(1)', 'Webhook URL must use https'],
    ['https://user@budget.example.com/hook', 'must not contain credentials'],
    [
      'https://user:pass@budget.example.com/hook',
      'must not contain credentials',
    ],
    ['https://:pass@budget.example.com/hook', 'must not contain credentials'],
    ['https://budget.example.com/hook?***', 'mask marker'],
    ['not-a-url', 'Invalid URL'],
  ])('rejects %s', (url, message) => {
    expect(() => assertSecureWebhookUrl(url)).toThrow(message);
  });

  it('never echoes the URL (it may carry a secret) in the error', () => {
    expect(() =>
      assertSecureWebhookUrl('http://budget.example.com/hook?secret=s3cr3t'),
    ).toThrow(/^(?!.*s3cr3t)/);
  });
});

describe('maskWebhookUrl', () => {
  it('hides the query string, which may carry the legacy secret', () => {
    expect(maskWebhookUrl('https://budget.example.com/hook?secret=abc')).toBe(
      'https://budget.example.com/hook?***',
    );
  });

  it('drops the fragment and credentials of a legacy URL', () => {
    expect(
      maskWebhookUrl('http://user:pw@budget.local:8080/hook?secret=abc#x'),
    ).toBe('http://budget.local:8080/hook?***');
    expect(maskWebhookUrl('http://user:pw@budget.local/hook')).toBe(
      'http://budget.local/hook',
    );
  });

  it('leaves a URL without anything to hide untouched', () => {
    expect(maskWebhookUrl('https://budget.example.com/hook')).toBe(
      'https://budget.example.com/hook',
    );
  });

  it('is idempotent', () => {
    const masked = maskWebhookUrl('https://b.example.com/h?secret=abc');
    expect(maskWebhookUrl(masked)).toBe(masked);
  });

  it('shows nothing for an unparseable stored value instead of throwing', () => {
    expect(maskWebhookUrl('')).toBeNull();
    expect(maskWebhookUrl('not-a-url?secret=x')).toBeNull();
  });

  it('passes null through', () => {
    expect(maskWebhookUrl(null)).toBeNull();
  });
});
