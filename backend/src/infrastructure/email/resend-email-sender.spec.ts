import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendEmailSender } from './resend-email-sender';

const MESSAGE = { to: 'x@example.com', subject: 'Lien', html: '<p>lien</p>' };

function sender(env: Record<string, string>) {
  return new ResendEmailSender(new ConfigService(env));
}

describe('ResendEmailSender', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does not log the recipient when the API key is missing', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await sender({}).send(MESSAGE);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('x@example.com');
  });

  it('keeps only the status and the Resend error name when the API rejects', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            name: 'validation_error',
            message: 'You can only send to x@example.com',
          }),
          { status: 403 },
        ),
      );

    const error = await sender({ RESEND_API_KEY: 're_test' })
      .send(MESSAGE)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Resend API request failed (403): validation_error',
    );
  });

  it('reports an unparseable error body without echoing it', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('<html>x@example.com</html>', { status: 502 }),
      );

    await expect(
      sender({ RESEND_API_KEY: 're_test' }).send(MESSAGE),
    ).rejects.toThrow('Resend API request failed (502): unknown_error');
  });
});
