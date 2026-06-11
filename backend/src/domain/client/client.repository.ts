import { Client } from './client';

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class ClientRepository {
  abstract findById(id: string): Promise<Client | null>;
  abstract findAll(): Promise<Client[]>;
  abstract save(client: Client): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
