export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  isAdmin: boolean;
  countryCode: string | null;
  locale: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatarKey: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export interface AdminClient {
  id: string;
  name: string;
  redirectUris: string[];
  logoutWebhookUrl: string | null;
  createdAt: string;
}

export interface CreateClientPayload {
  id: string;
  name: string;
  redirectUris: string[];
  logoutWebhookUrl: string | null;
}

export interface UpdateClientPayload {
  name?: string;
  redirectUris?: string[];
  logoutWebhookUrl?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'include', ...init });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === 'object' && 'message' in body ? body.message : null;
    throw new Error(typeof message === 'string' ? message : `Request to ${path} failed (${response.status})`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function sendJson<T>(path: string, method: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const apiClient = {
  async requestMagicLink(email: string, redirect?: string): Promise<void> {
    await sendJson('/auth/request-link', 'POST', { email, redirect });
  },

  async verifyMagicLink(token: string): Promise<{ userId: string }> {
    return sendJson('/auth/callback', 'POST', { token });
  },

  async logout(): Promise<void> {
    await request('/auth/logout', { method: 'POST' });
  },

  async fetchCurrentUser(): Promise<CurrentUser | null> {
    const response = await fetch('/profile', { credentials: 'include' });
    if (!response.ok) {
      return null;
    }
    return response.json() as Promise<CurrentUser>;
  },

  async updateProfile(payload: { name?: string; countryCode?: string | null; locale?: string | null }): Promise<void> {
    await sendJson('/profile', 'PATCH', payload);
  },

  async uploadAvatar(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('avatar', file);
    await request('/profile/avatar', { method: 'POST', body: formData });
  },

  fetchUsers(): Promise<AdminUser[]> {
    return request<AdminUser[]>('/admin/users');
  },

  inviteUser(email: string, name: string): Promise<AdminUser> {
    return sendJson('/admin/users', 'POST', { email, name });
  },

  updateUser(id: string, payload: { name?: string; isAdmin?: boolean }): Promise<AdminUser> {
    return sendJson(`/admin/users/${id}`, 'PATCH', payload);
  },

  fetchClients(): Promise<AdminClient[]> {
    return request<AdminClient[]>('/admin/clients');
  },

  createClient(payload: CreateClientPayload): Promise<{ client: AdminClient; clientSecret: string }> {
    return sendJson('/admin/clients', 'POST', payload);
  },

  updateClient(id: string, payload: UpdateClientPayload): Promise<AdminClient> {
    return sendJson(`/admin/clients/${id}`, 'PATCH', payload);
  },

  async deleteClient(id: string): Promise<void> {
    await request(`/admin/clients/${id}`, { method: 'DELETE' });
  },

  fetchClientAccess(clientId: string): Promise<string[]> {
    return request<string[]>(`/admin/clients/${clientId}/access`);
  },

  async grantClientAccess(clientId: string, userId: string): Promise<void> {
    await sendJson(`/admin/clients/${clientId}/access`, 'POST', { userId });
  },

  async revokeClientAccess(clientId: string, userId: string): Promise<void> {
    await request(`/admin/clients/${clientId}/access/${userId}`, { method: 'DELETE' });
  },
};
