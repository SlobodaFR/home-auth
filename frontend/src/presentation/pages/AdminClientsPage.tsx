import { FormEvent, useEffect, useState } from 'react';
import {
  AdminClient,
  AdminClientSummary,
  AdminUser,
  apiClient,
} from '../../infrastructure/api-client';
import { Modal } from '../components/Modal';
import { RandomStringGenerator } from '../components/RandomStringGenerator';

export function AdminClientsPage() {
  const [clients, setClients] = useState<AdminClientSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<{
    clientId: string;
    secret: string;
  } | null>(null);
  const [dialog, setDialog] = useState<{
    kind: DialogKind;
    clientId: string;
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [logoutWebhookUrl, setLogoutWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Reloads keep the list on screen: only the first load shows the placeholder.
  async function load() {
    try {
      const [clientList, userList] = await Promise.all([
        apiClient.fetchClients(),
        apiClient.fetchUsers(),
      ]);
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

  async function handleUpdate(
    clientId: string,
    redirectUris: string[],
    logoutWebhookUrl: string | null,
  ) {
    setError(null);
    try {
      await apiClient.updateClient(clientId, {
        redirectUris,
        logoutWebhookUrl,
      });
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  async function handleDelete(clientId: string) {
    setError(null);
    try {
      await apiClient.deleteClient(clientId);
      setDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  const dialogClient = clients.find((client) => client.id === dialog?.clientId);

  return (
    <main className="max-w-7xl mx-auto px-margin-mobile md:px-margin-desktop py-xxl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-lg mb-xxl">
        <div>
          <h1 className="font-heading-xl text-heading-xl text-ink tracking-tight">
            Applications OAuth
          </h1>
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
            <span className="font-label-sm text-label-sm text-charcoal block px-xs">
              Identifiant (client_id)
            </span>
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
            <span className="font-label-sm text-label-sm text-charcoal block px-xs">
              Nom
            </span>
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
          <RandomStringGenerator />
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
            Secret pour <strong>{newSecret.clientId}</strong> (affiche une seule
            fois) :
          </p>
          <code className="block break-all font-caption text-caption bg-soft-cloud p-md rounded-lg">
            {newSecret.secret}
          </code>
        </div>
      )}

      {error && (
        <p className="font-caption text-caption text-error mb-md">{error}</p>
      )}

      <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
        {loading ? (
          <p className="font-body-md text-body-md text-mute p-xl">
            Chargement...
          </p>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-xxl px-lg text-center">
            <div className="w-16 h-16 bg-soft-cloud rounded-full flex items-center justify-center text-mute mb-md">
              <span className="material-symbols-outlined text-[32px]">
                apps
              </span>
            </div>
            <p className="font-body-strong text-body-strong text-ink">
              Aucune application
            </p>
            <p className="font-caption text-caption text-mute mt-xs">
              Creez votre premiere application OAuth.
            </p>
          </div>
        ) : (
          <>
            <ul className="md:hidden divide-y divide-hairline">
              {clients.map((client) => (
                <li
                  key={client.id}
                  className="flex items-center gap-md px-lg py-md"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-body-strong text-body-strong text-ink truncate">
                      {client.name}
                    </p>
                    <p className="font-caption text-caption text-mute truncate">
                      {formatUserCount(client.allowedUserCount)}
                    </p>
                  </div>
                  <ClientActions client={client} onOpen={setDialog} />
                </li>
              ))}
            </ul>
            <table className="hidden md:table w-full text-left table-fixed">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Redirect URIs
                  </th>
                  <th className="w-36 px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider">
                    Utilisateurs
                  </th>
                  <th className="w-44 px-lg py-md font-label-sm text-label-sm text-mute uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-hairline last:border-b-0 hover:bg-surface-container-low transition-colors"
                  >
                    <td className="px-lg py-md">
                      <p className="font-body-strong text-body-strong text-ink truncate">
                        {client.name}
                      </p>
                      <p className="font-caption text-caption text-mute truncate">
                        {client.id}
                      </p>
                    </td>
                    <td className="px-lg py-md font-body-md text-body-md text-mute">
                      <p className="truncate">{client.redirectUris[0]}</p>
                      {client.redirectUris.length > 1 && (
                        <p className="font-caption text-caption text-mute">
                          +{client.redirectUris.length - 1} autre(s)
                        </p>
                      )}
                    </td>
                    <td className="px-lg py-md font-body-md text-body-md text-mute">
                      {client.allowedUserCount}
                    </td>
                    <td className="px-lg py-md">
                      <div className="flex justify-end">
                        <ClientActions client={client} onOpen={setDialog} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {dialogClient && dialog?.kind === 'edit' && (
        <Modal
          title={`Modifier ${dialogClient.name}`}
          onClose={() => setDialog(null)}
        >
          <ClientEditForm
            client={dialogClient}
            onSave={handleUpdate}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
      {dialogClient && dialog?.kind === 'access' && (
        <Modal
          title={`Acces a ${dialogClient.name}`}
          onClose={() => setDialog(null)}
        >
          <ClientAccessPanel
            clientId={dialogClient.id}
            users={users}
            onChange={load}
            onError={setError}
          />
        </Modal>
      )}
      {dialogClient && dialog?.kind === 'delete' && (
        <Modal
          title={`Supprimer ${dialogClient.name} ?`}
          onClose={() => setDialog(null)}
        >
          <p className="font-body-md text-body-md text-mute">
            L&apos;application <strong>{dialogClient.id}</strong> et ses acces
            seront supprimes. Cette action est irreversible.
          </p>
          <div className="flex gap-md">
            <button
              type="button"
              onClick={() => void handleDelete(dialogClient.id)}
              className="flex-1 px-lg py-sm bg-error text-white rounded-lg font-button-md text-button-md hover:opacity-90 transition-all"
            >
              Supprimer
            </button>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="flex-1 px-lg py-sm border border-hairline rounded-lg font-button-md text-button-md text-charcoal hover:bg-soft-cloud transition-all"
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

type DialogKind = 'edit' | 'access' | 'delete';

function formatUserCount(count: number): string {
  return `${count.toString()} utilisateur${count > 1 ? 's' : ''}`;
}

const CLIENT_ACTIONS: {
  kind: DialogKind;
  icon: string;
  label: string;
  hover: string;
}[] = [
  {
    kind: 'edit',
    icon: 'edit',
    label: 'Modifier',
    hover: 'hover:text-primary',
  },
  {
    kind: 'access',
    icon: 'group',
    label: 'Gerer les acces',
    hover: 'hover:text-primary',
  },
  {
    kind: 'delete',
    icon: 'delete',
    label: 'Supprimer',
    hover: 'hover:text-error',
  },
];

function ClientActions({
  client,
  onOpen,
}: {
  client: AdminClient;
  onOpen: (dialog: { kind: DialogKind; clientId: string }) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-xs">
      {CLIENT_ACTIONS.map(({ kind, icon, label, hover }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onOpen({ kind, clientId: client.id })}
          aria-label={`${label} ${client.name}`}
          title={label}
          className={`h-10 w-10 flex items-center justify-center rounded-lg text-mute ${hover} hover:bg-soft-cloud transition-colors`}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {icon}
          </span>
        </button>
      ))}
    </div>
  );
}

function ClientEditForm({
  client,
  onSave,
  onCancel,
}: {
  client: AdminClient;
  onSave: (
    clientId: string,
    redirectUris: string[],
    logoutWebhookUrl: string | null,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [redirectUris, setRedirectUris] = useState(
    client.redirectUris.join('\n'),
  );
  const [logoutWebhookUrl, setLogoutWebhookUrl] = useState(
    client.logoutWebhookUrl ?? '',
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(
        client.id,
        redirectUris
          .split('\n')
          .map((uri) => uri.trim())
          .filter(Boolean),
        logoutWebhookUrl.trim() || null,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-md"
    >
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
          disabled={saving}
          className="flex-1 px-lg py-sm bg-primary text-white rounded-lg font-button-md text-button-md hover:bg-primary-container transition-all disabled:opacity-50"
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-lg py-sm border border-hairline rounded-lg font-button-md text-button-md text-charcoal hover:bg-soft-cloud transition-all"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function ClientAccessPanel({
  clientId,
  users,
  onChange,
  onError,
}: {
  clientId: string;
  users: AdminUser[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Reloads after grant/revoke keep the list on screen (and the focus in the modal).
  async function load() {
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
      await Promise.all([load(), onChange()]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  async function handleRevoke(userId: string) {
    try {
      await apiClient.revokeClientAccess(clientId, userId);
      await Promise.all([load(), onChange()]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  const allowedUsers = users.filter((user) => allowedUserIds.includes(user.id));
  const availableUsers = users.filter(
    (user) => !allowedUserIds.includes(user.id),
  );

  if (loading) {
    return <p className="font-caption text-caption text-mute">Chargement...</p>;
  }

  return (
    <div className="space-y-md">
      <p className="font-label-sm text-label-sm text-charcoal uppercase tracking-wider">
        Acces autorises
      </p>
      <ul className="flex flex-col gap-xs">
        {allowedUsers.map((user) => (
          <li
            key={user.id}
            className="flex justify-between items-center gap-sm font-body-md text-body-md text-ink"
          >
            <span className="min-w-0 truncate">
              {user.name} ({user.email})
            </span>
            <button
              type="button"
              onClick={() => void handleRevoke(user.id)}
              className="shrink-0 font-label-sm text-label-sm text-error hover:underline uppercase"
            >
              Revoquer
            </button>
          </li>
        ))}
        {allowedUsers.length === 0 && (
          <li className="font-caption text-caption text-mute">
            Aucun utilisateur autorise.
          </li>
        )}
      </ul>

      {availableUsers.length > 0 && (
        <form
          onSubmit={(event) => void handleGrant(event)}
          className="flex flex-col sm:flex-row gap-sm"
        >
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="flex-1 min-w-0 px-md py-sm bg-canvas border border-hairline rounded-lg text-ink font-body-md text-body-md outline-none"
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
