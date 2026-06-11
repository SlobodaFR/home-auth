import { ChangeEvent, FormEvent, useState } from 'react';
import { apiClient } from '../../infrastructure/api-client';
import { useAuth } from '../auth/AuthProvider';

export function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  async function handleNameSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSavingName(true);
    try {
      await apiClient.updateProfile(name.trim());
      await refresh();
      setMessage('Profil mis a jour.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setMessage(null);
    setUploadingAvatar(true);
    try {
      await apiClient.uploadAvatar(file);
      await refresh();
      setMessage('Avatar mis a jour.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-margin-mobile md:px-margin-desktop py-xxl">
      <h1 className="font-heading-xl text-heading-xl text-ink tracking-tight">Mon profil</h1>
      <p className="font-body-md text-body-md text-mute mt-xs mb-xl">
        Gerez vos informations personnelles et votre compte.
      </p>

      <form onSubmit={(event) => void handleNameSubmit(event)}>
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <div className="p-xl space-y-lg">
            <div className="flex items-center gap-md">
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-16 h-16 rounded-full object-cover bg-surface-variant"
              />
              <div>
                <p className="font-body-strong text-body-strong text-ink">Photo de profil</p>
                <p className="font-caption text-caption text-mute mb-xs">
                  Recommande&nbsp;: image carree, JPG ou PNG, min 400x400px.
                </p>
                <label className="inline-block font-button-md text-button-md text-charcoal border border-hairline rounded-lg px-md py-xs cursor-pointer hover:bg-soft-cloud transition-all">
                  {uploadingAvatar ? 'Envoi...' : 'Changer la photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => void handleAvatarChange(event)}
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-hairline pt-lg space-y-xs">
              <label className="font-label-sm text-label-sm text-charcoal block px-xs" htmlFor="name">
                Nom affiche
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              />
              <p className="font-caption text-caption text-mute px-xs">
                C&apos;est ainsi que votre nom apparaitra aux autres administrateurs.
              </p>
            </div>

            <div className="border-t border-hairline pt-lg space-y-xs">
              <label className="font-label-sm text-label-sm text-charcoal block px-xs" htmlFor="email">
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="w-full px-md py-sm bg-soft-cloud border border-hairline rounded-lg text-mute font-body-md outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-md px-xl py-lg bg-soft-cloud border-t border-hairline">
            <button
              type="button"
              onClick={() => void logout()}
              className="font-button-md text-button-md text-charcoal border border-hairline rounded-lg px-lg py-sm hover:bg-canvas transition-all"
            >
              Deconnexion
            </button>
            <div className="flex items-center gap-md">
              {error && <p className="font-caption text-caption text-error">{error}</p>}
              {message && <p className="font-caption text-caption text-secondary">{message}</p>}
              <button
                type="submit"
                disabled={savingName}
                className="bg-primary hover:bg-on-primary-fixed-variant text-on-primary font-button-md text-button-md py-sm px-lg rounded-lg transition-all duration-200 active:scale-[0.98] shadow-sm disabled:opacity-50"
              >
                {savingName ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
