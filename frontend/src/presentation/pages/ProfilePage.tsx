import { ChangeEvent, FormEvent, useState } from 'react';
import { apiClient } from '../../infrastructure/api-client';
import { useAuth } from '../auth/AuthProvider';

const COUNTRIES: { code: string; label: string; flag: string }[] = [
  { code: 'FR', label: 'France', flag: '🇫🇷' },
  { code: 'BE', label: 'Belgique', flag: '🇧🇪' },
  { code: 'CH', label: 'Suisse', flag: '🇨🇭' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
  { code: 'US', label: 'États-Unis', flag: '🇺🇸' },
  { code: 'GB', label: 'Royaume-Uni', flag: '🇬🇧' },
  { code: 'DE', label: 'Allemagne', flag: '🇩🇪' },
  { code: 'ES', label: 'Espagne', flag: '🇪🇸' },
  { code: 'IT', label: 'Italie', flag: '🇮🇹' },
  { code: 'PT', label: 'Portugal', flag: '🇵🇹' },
  { code: 'NL', label: 'Pays-Bas', flag: '🇳🇱' },
  { code: 'LU', label: 'Luxembourg', flag: '🇱🇺' },
];

const LOCALES: { code: string; label: string; flag: string }[] = [
  { code: 'fr-FR', label: 'Français (France)', flag: '🇫🇷' },
  { code: 'fr-BE', label: 'Français (Belgique)', flag: '🇧🇪' },
  { code: 'fr-CH', label: 'Français (Suisse)', flag: '🇨🇭' },
  { code: 'fr-CA', label: 'Français (Canada)', flag: '🇨🇦' },
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { code: 'de-DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt-PT', label: 'Português', flag: '🇵🇹' },
  { code: 'nl-NL', label: 'Nederlands', flag: '🇳🇱' },
];

export function ProfilePage() {
  const { user, logout, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [countryCode, setCountryCode] = useState<string>(user?.countryCode ?? '');
  const [locale, setLocale] = useState<string>(user?.locale ?? '');
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
      await apiClient.updateProfile({
        name: name.trim(),
        countryCode: countryCode || null,
        locale: locale || null,
      });
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

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode);
  const selectedLocale = LOCALES.find((l) => l.code === locale);

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

            <div className="border-t border-hairline pt-lg grid grid-cols-1 md:grid-cols-2 gap-lg">
              <div className="space-y-xs">
                <label className="font-label-sm text-label-sm text-charcoal block px-xs" htmlFor="country">
                  Pays
                </label>
                <div className="relative">
                  {selectedCountry && (
                    <span className="absolute left-md top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                      {selectedCountry.flag}
                    </span>
                  )}
                  <select
                    id="country"
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                    className={`w-full py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none ${selectedCountry ? 'pl-10 pr-md' : 'px-md'}`}
                  >
                    <option value="">— Non renseigne —</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-xs">
                <label className="font-label-sm text-label-sm text-charcoal block px-xs" htmlFor="locale">
                  Langue
                </label>
                <div className="relative">
                  {selectedLocale && (
                    <span className="absolute left-md top-1/2 -translate-y-1/2 text-lg pointer-events-none">
                      {selectedLocale.flag}
                    </span>
                  )}
                  <select
                    id="locale"
                    value={locale}
                    onChange={(event) => setLocale(event.target.value)}
                    className={`w-full py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none ${selectedLocale ? 'pl-10 pr-md' : 'px-md'}`}
                  >
                    <option value="">— Non renseigne —</option>
                    {LOCALES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag} {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
