export function buildMagicLinkEmailHtml(link: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Connexion</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
      <tr>
        <td align="center" style="padding:48px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #e5e5e5;">
            <tr>
              <td style="padding:32px;text-align:center;">
                <h1 style="margin:0 0 24px;font-size:24px;color:#111111;">Connexion</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#555555;">
                  Cliquez sur le lien ci-dessous pour vous connecter.<br />
                  <strong>Ce lien est valable pendant 15 minutes.</strong>
                </p>
                <a href="${link}" style="display:inline-block;padding:12px 32px;background-color:#111111;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">
                  Se connecter
                </a>
                <p style="margin:24px 0 0;font-size:12px;color:#999999;word-break:break-all;">${link}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
