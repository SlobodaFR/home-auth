import { Fragment, FormEvent, useEffect, useState } from 'react';
import { AdminClient, AdminUser, apiClient } from '../../infrastructure/api-client';

export function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<{ clientId: string; secret: string } | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [logoutWebhookUrl, setLogoutWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [clientList, userList] = await Promise.all([apiClient.fetchClients(), apiClient.fetchUsers()]);
      setClients(clientList);
      setUsers(userList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const result = await apiClient.createClient({
        id: id.trim(),
        name: name.trim(),
        redirectUris: redirectUris
          .split('\n')
          .map((uri) => uri.trim())
          .filter(Boolean),
        logoutWebhookUrl: logoutWebhookUrl.trim() || null,
      });
      setNewSecret({ clientId: result.client.id, secret: result.clientSecret });
      setId('');
      setName('');
      setRedirectUris('');
      setLogoutWebhookUrl('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(clientId: string) {
    setError(null);
    try {
      await apiClient.deleteClient(clientId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop py-xxl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-lg mb-xxl">
        <div>
          <h1 className="font-heading-xl text-heading-xl text-ink tracking-tight">Applications OAuth</h1>
          <p className="font-body-md text-body-md text-mute mt-xs">
            Gerez vos applications et leurs identifiants de securite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="bg-primary text-white px-lg py-sm rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all shadow-sm flex items-center gap-sm self-start"
        >
          <span className="material-symbols-outlined">add</span>
          Creer une application
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="bg-canvas border border-hairline rounded-xl p-xl mb-xl flex flex-col gap-md"
        >
          <label className="space-y-xs block">
            <span className="font-label-sm text-label-sm text-charcoal block px-xs">Identifiant (client_id)</span>
            <input
              type="text"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="budget"
              className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              required
            />
          </label>
          <label className="space-y-xs block">
            <span className="font-label-sm text-label-sm text-charcoal block px-xs">Nom</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              required
            />
          </label>
          <label className="space-y-xs block">
            <span className="font-label-sm text-label-sm text-charcoal block px-xs">
              Redirect URIs (une par ligne)
            </span>
            <textarea
              value={redirectUris}
              onChange={(event) => setRedirectUris(event.target.value)}
              rows={3}
              className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              required
            />
          </label>
          <label className="space-y-xs block">
            <span className="font-label-sm text-label-sm text-charcoal block px-xs">
              Webhook de deconnexion (optionnel)
            </span>
            <input
              type="text"
              value={logoutWebhookUrl}
              onChange={(event) => setLogoutWebhookUrl(event.target.value)}
              className="w-full px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
            />
          </label>
          <div className="flex gap-md">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-lg py-sm bg-primary text-white rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all disabled:opacity-50"
            >
              {creating ? 'Creation...' : 'Creer'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="flex-1 px-lg py-sm border border-hairline rounded-lg font-button-md text-button-md text-charcoal hover:bg-soft-cloud transition-all"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {newSecret && (
        <div className="border border-error rounded-xl p-xl mb-xl bg-canvas">
          <p className="font-body-md text-body-md text-ink mb-sm">
            Secret pour <strong>{newSecret.clientId}</strong> (affiche une seule fois) :
          </p>
          <code className="block break-all font-caption text-caption bg-soft-cloud p-md rounded-lg">
            {newSecret.secret}
          </code>
        </div>
      )}

      {error && <p className="font-caption text-caption text-error mb-md">{error}</p>}

      <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
        {loading ? (
          <p className="font-body-md text-body-md text-mute p-xl">Chargement...</p>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-xxl px-lg text-center">
            <div className="w-16 h-16 bg-soft-cloud rounded-full flex items-center justify-center text-mute mb-md">
              <span className="material-symbols-outlined text-[32px]">apps</span>
            </div>
            <p className="font-body-strong text-body-strong text-ink">Aucune application</p>
            <p className="font-caption text-caption text-mute mt-xs">Creez votre premiere application OAuth.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Redirect URIs
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Webhook de deconnexion
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <Fragment key={client.id}>
                    <tr className="border-b border-hairline hover:bg-surface-container-low transition-colors group">
                      <td className="px-lg py-md">
                        <p className="font-body-strong text-body-strong text-ink">{client.name}</p>
                        <p className="font-caption text-caption text-mute">{client.id}</p>
                      </td>
                      <td className="px-lg py-md font-body-md text-body-md text-mute">
                        {client.redirectUris[0]}
                        {client.redirectUris.length > 1 && (
                          <span className="font-caption text-caption text-mute">
                            {' '}
                            +{client.redirectUris.length - 1} more
                          </span>
                        )}
                      </td>
                      <td className="px-lg py-md font-body-md text-body-md text-mute">
                        {client.logoutWebhookUrl ?? '—'}
                      </td>
                      <td className="px-lg py-md text-right">
                        <div className="flex items-center justify-end gap-sm">
                          <button
                            type="button"
                            onClick={() => setExpandedClientId(expandedClientId === client.id ? null : client.id)}
                            className="p-xs text-mute hover:text-primary transition-colors"
                            title="Gerer les acces"
                          >
                            <span className="material-symbols-outlined">group</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(client.id)}
                            className="p-xs text-mute hover:text-error transition-colors"
                            title="Supprimer"
                          >
                            <span className="material-symbols-outlined">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedClientId === client.id && (
                      <tr className="border-b border-hairline bg-surface-container-low">
                        <td colSpan={4} className="px-lg py-lg">
                          <ClientAccessPanel clientId={client.id} users={users} onError={setError} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function ClientAccessPanel({
  clientId,
  users,
  onError,
}: {
  clientId: string;
  users: AdminUser[];
  onError: (message: string) => void;
}) {
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');

  async function load() {
    setLoading(true);
    try {
      setAllowedUserIds(await apiClient.fetchClientAccess(clientId));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleGrant(event: FormEvent) {
    event.preventDefault();
    if (!selectedUserId) {
      return;
    }
    try {
      await apiClient.grantClientAccess(clientId, selectedUserId);
      setSelectedUserId('');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  async function handleRevoke(userId: string) {
    try {
      await apiClient.revokeClientAccess(clientId, userId);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  const allowedUsers = users.filter((user) => allowedUserIds.includes(user.id));
  const availableUsers = users.filter((user) => !allowedUserIds.includes(user.id));

  if (loading) {
    return <p className="font-caption text-caption text-mute">Chargement...</p>;
  }

  return (
    <div className="space-y-md">
      <p className="font-label-sm text-label-sm text-charcoal uppercase tracking-wider">Acces autorises</p>
      <ul className="flex flex-col gap-xs">
        {allowedUsers.map((user) => (
          <li key={user.id} className="flex justify-between items-center font-body-md text-body-md text-ink">
            <span>
              {user.name} ({user.email})
            </span>
            <button
              type="button"
              onClick={() => void handleRevoke(user.id)}
              className="font-label-sm text-label-sm text-error hover:underline uppercase"
            >
              Revoquer
            </button>
          </li>
        ))}
        {allowedUsers.length === 0 && (
          <li className="font-caption text-caption text-mute">Aucun utilisateur autorise.</li>
        )}
      </ul>

      {availableUsers.length > 0 && (
        <form onSubmit={(event) => void handleGrant(event)} className="flex gap-sm">
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="flex-1 px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md outline-none"
          >
            <option value="">Selectionner un utilisateur</option>
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-primary text-white px-lg py-sm rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all"
          >
            Autoriser
          </button>
        </form>
      )}
    </div>
  );
}
