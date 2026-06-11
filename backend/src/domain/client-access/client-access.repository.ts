import { ClientAccess } from './client-access';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class ClientAccessRepository {
  abstract exists(userId: string, clientId: string): Promise<boolean>;
  abstract grant(access: ClientAccess): Promise<void>;
  abstract revoke(userId: string, clientId: string): Promise<void>;
  abstract findByClientId(clientId: string): Promise<ClientAccess[]>;
}
