import { assertSecureWebhookUrl } from './webhook-url';

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
