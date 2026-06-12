import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '../../infrastructure/api-client';
import { useAuth } from '../auth/AuthProvider';

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  const token = searchParams.get('token');
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }

    apiClient
      .verifyMagicLink(token)
      .then(() => refresh())
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token, refresh]);

  if (status === 'success') {
    if (redirect?.startsWith('/authorize?')) {
      window.location.href = redirect;
      return null;
    }
    return <Navigate to="/" replace />;
  }

  if (status === 'error') {
    return (
      <main className="bg-soft-cloud min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop">
        <div className="bg-canvas border border-hairline rounded-xl p-xl shadow-soft text-center max-w-[440px] w-full">
          <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-lg">
            <span className="material-symbols-outlined !text-[32px]">error</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-ink mb-md tracking-tight">Lien invalide</h1>
          <p className="font-body-md text-body-md text-mute mb-xl leading-relaxed">
            Ce lien de connexion est invalide ou a expire.
          </p>
          <a
            href="/login"
            className="font-button-md text-button-md text-primary hover:underline transition-colors"
          >
            Retour a la connexion
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-soft-cloud min-h-screen flex flex-col items-center justify-center gap-lg">
      <span className="font-headline-lg text-headline-lg font-black text-primary tracking-tighter">
        Auth Service
      </span>
      <div className="h-10 w-10 border-4 border-primary-fixed border-t-primary rounded-full animate-spin" />
      <div className="text-center">
        <p className="font-heading-md text-heading-md text-ink">Connexion en cours...</p>
        <p className="font-body-md text-body-md text-mute mt-xs">
          Verification de vos identifiants et securisation de votre session.
        </p>
      </div>
    </main>
  );
}
