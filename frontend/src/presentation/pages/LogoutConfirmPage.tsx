import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  displayableClientId,
  logoutEverywhere,
} from '../../domain/logout-request';
import { apiClient } from '../../infrastructure/api-client';

export function LogoutConfirmPage() {
  const [searchParams] = useSearchParams();
  const clientIdParam = searchParams.get('client_id');
  const postLogoutRedirectUri = searchParams.get('post_logout_redirect_uri');
  const state = searchParams.get('state');
  // The server revalidates everything; nothing but a well-formed client id is displayed.
  const client = displayableClientId(clientIdParam);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const canConfirm = clientIdParam !== null && postLogoutRedirectUri !== null;

  async function leave(everywhere: boolean) {
    if (clientIdParam === null || postLogoutRedirectUri === null) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      if (everywhere) {
        await logoutEverywhere(apiClient);
      }
      const redirectTo = await apiClient.confirmRpLogout({
        client_id: clientIdParam,
        post_logout_redirect_uri: postLogoutRedirectUri,
        ...(state === null ? {} : { state }),
      });
      window.location.assign(redirectTo);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <main className="bg-soft-cloud min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop">
      <div className="bg-canvas border border-hairline rounded-xl p-xl shadow-soft text-center max-w-[440px] w-full">
        <h1 className="font-headline-lg text-headline-lg text-ink mb-md tracking-tight">
          Se deconnecter ?
        </h1>
        <p className="font-body-md text-body-md text-mute mb-xl leading-relaxed">
          Vous allez etre deconnecte de la session SSO de ce navigateur. Vos
          autres appareils restent connectes.
        </p>
        {client && (
          <p className="font-caption text-caption text-mute mb-xl break-all">
            Application : <span className="text-charcoal">{client}</span>
          </p>
        )}
        {failed && (
          <p role="alert" className="text-error mb-lg">
            La deconnexion a echoue. Revenez sur l'application et reessayez.
          </p>
        )}
        <div className="flex flex-col gap-md">
          <button
            type="button"
            disabled={busy || !canConfirm}
            onClick={() => void leave(false)}
            className="font-button-md text-button-md bg-primary text-white rounded-lg py-md disabled:opacity-50"
          >
            Se deconnecter
          </button>
          <button
            type="button"
            disabled={busy || !canConfirm}
            onClick={() => void leave(true)}
            className="font-button-md text-button-md text-primary hover:underline disabled:opacity-50"
          >
            Se deconnecter partout
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              window.history.back();
            }}
            className="font-button-md text-button-md text-mute hover:underline"
          >
            Annuler
          </button>
        </div>
      </div>
    </main>
  );
}
