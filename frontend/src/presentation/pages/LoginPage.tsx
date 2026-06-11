import { FormEvent, useState } from 'react';
import { apiClient } from '../../infrastructure/api-client';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      setError('Veuillez renseigner votre email.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiClient.requestMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-soft-cloud min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop">
      <div className="w-full max-w-[440px]">
        <div className="bg-canvas border border-hairline rounded-xl p-xl shadow-soft">
          <div className="flex flex-col items-center mb-xxl text-center">
            <div className="w-16 h-16 bg-primary-fixed text-primary rounded-xl flex items-center justify-center mb-lg">
              <span className="material-symbols-outlined !text-[40px]">shield</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-ink tracking-tight">Auth Service</h1>
            <p className="font-body-md text-body-md text-mute mt-xs">Acces securise a vos applications</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center mb-lg">
                <div className="relative w-16 h-16 bg-secondary-container/30 text-secondary rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined !text-[32px]">mark_email_read</span>
                </div>
              </div>
              <h2 className="font-headline-lg text-headline-lg text-ink mb-md tracking-tight">
                Verifiez votre email
              </h2>
              <p className="font-body-md text-body-md text-mute leading-relaxed">
                Nous avons envoye un lien de connexion a <strong className="text-ink">{email}</strong>. Ouvrez votre
                boite mail (et vos spams) et cliquez sur le lien pour continuer.
              </p>
            </div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-lg">
              <div className="space-y-xs">
                <label className="font-label-sm text-label-sm text-charcoal block px-xs" htmlFor="email">
                  Adresse email
                </label>
                <input
                  id="email"
                  type="email"
                  className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="vous@exemple.com"
                  autoFocus
                />
              </div>

              {error && <p className="text-error text-sm">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-on-primary-fixed-variant text-on-primary font-button-md text-button-md py-md px-lg rounded-lg transition-all duration-200 active:scale-[0.98] shadow-sm flex items-center justify-center gap-sm group disabled:opacity-50"
              >
                <span>{submitting ? 'Envoi...' : 'Recevoir un lien de connexion'}</span>
                {!submitting && (
                  <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                )}
              </button>
            </form>
          )}

          {!sent && (
            <div className="mt-xl flex items-start gap-sm p-md bg-surface-container-low rounded-lg border border-hairline">
              <span className="material-symbols-outlined text-primary text-[20px] mt-[2px]">info</span>
              <p className="font-caption text-caption text-charcoal">
                Nous vous enverrons un lien securise pour vous connecter instantanement. Aucun mot de passe requis.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
