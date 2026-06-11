export interface StoredAvatar {
  contentType: string;
  body: Buffer;
}

/**
 * Port (driven side) implemented by the infrastructure layer (MinIO/S3).
 */
export abstract class AvatarStorage {
  abstract upload(userId: string, avatar: StoredAvatar): Promise<string>;
  abstract get(avatarKey: string): Promise<StoredAvatar | null>;
  abstract delete(avatarKey: string): Promise<void>;
}
