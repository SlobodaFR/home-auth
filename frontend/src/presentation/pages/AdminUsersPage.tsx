import { FormEvent, useEffect, useState } from 'react';
import { AdminUser, apiClient } from '../../infrastructure/api-client';

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setUsers(await apiClient.fetchUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInviting(true);
    try {
      await apiClient.inviteUser(email.trim(), name.trim());
      setEmail('');
      setName('');
      setShowInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setInviting(false);
    }
  }

  async function toggleAdmin(user: AdminUser) {
    setError(null);
    try {
      await apiClient.updateUser(user.id, { isAdmin: !user.isAdmin });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  const filteredUsers = users.filter((user) => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return user.email.toLowerCase().includes(term) || user.name.toLowerCase().includes(term);
  });

  return (
    <main className="max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop py-xxl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-lg mb-xxl">
        <div>
          <h1 className="font-heading-xl text-heading-xl text-ink tracking-tight">Utilisateurs</h1>
          <p className="font-body-md text-body-md text-mute mt-xs">
            Gerez les membres de votre plateforme et leurs permissions.
          </p>
        </div>
        <div className="flex gap-sm">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-mute">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un utilisateur..."
              className="pl-10 pr-4 py-2 border border-hairline rounded-lg bg-canvas w-full md:w-64 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowInvite((value) => !value)}
            className="bg-primary text-white px-lg py-sm rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all shadow-sm flex items-center gap-sm"
          >
            <span className="material-symbols-outlined">person_add</span>
            Inviter
          </button>
        </div>
      </div>

      {showInvite && (
        <form
          onSubmit={(event) => void handleInvite(event)}
          className="bg-canvas border border-hairline rounded-xl p-xl mb-xl flex flex-col gap-md"
        >
          <div className="flex flex-col md:flex-row gap-md">
            <label className="flex-1 space-y-xs">
              <span className="font-label-sm text-label-sm text-charcoal block px-xs">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                required
              />
            </label>
            <label className="flex-1 space-y-xs">
              <span className="font-label-sm text-label-sm text-charcoal block px-xs">Nom</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                required
              />
            </label>
          </div>
          <div className="flex gap-md">
            <button
              type="submit"
              disabled={inviting}
              className="flex-1 px-lg py-sm bg-primary text-white rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all disabled:opacity-50"
            >
              {inviting ? 'Invitation...' : "Envoyer l'invitation"}
            </button>
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="flex-1 px-lg py-sm border border-hairline rounded-lg font-button-md text-button-md text-charcoal hover:bg-soft-cloud transition-all"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {error && <p className="font-caption text-caption text-error mb-md">{error}</p>}

      <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
        {loading ? (
          <p className="font-body-md text-body-md text-mute p-xl">Chargement...</p>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-xxl px-lg text-center">
            <div className="w-16 h-16 bg-soft-cloud rounded-full flex items-center justify-center text-mute mb-md">
              <span className="material-symbols-outlined text-[32px]">group_off</span>
            </div>
            <p className="font-body-strong text-body-strong text-ink">Aucun utilisateur</p>
            <p className="font-caption text-caption text-mute mt-xs">
              Invitez un nouvel utilisateur pour commencer.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Utilisateur
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Cree le
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-hairline hover:bg-surface-container-low transition-colors group">
                    <td className="px-lg py-md">
                      <div className="flex items-center gap-md">
                        <div className="w-10 h-10 rounded-full border border-hairline overflow-hidden flex-shrink-0">
                          <img src={`/avatars/${user.id}`} alt={user.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="font-body-strong text-body-strong text-ink">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-lg py-md font-body-md text-body-md text-mute">{user.email}</td>
                    <td className="px-lg py-md">
                      {user.isAdmin ? (
                        <span className="inline-flex items-center px-sm py-xs rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-sm py-xs rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
                          Membre
                        </span>
                      )}
                    </td>
                    <td className="px-lg py-md font-body-md text-body-md text-mute">
                      {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-lg py-md text-right">
                      <button
                        type="button"
                        onClick={() => void toggleAdmin(user)}
                        className="font-label-sm text-label-sm text-mute hover:text-primary transition-colors uppercase"
                      >
                        {user.isAdmin ? 'Retirer admin' : 'Rendre admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && (
        <p className="font-caption text-caption text-mute mt-md">
          {filteredUsers.length} sur {users.length} membre{users.length > 1 ? 's' : ''}
        </p>
      )}
    </main>
  );
}
