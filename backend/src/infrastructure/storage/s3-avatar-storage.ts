import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvatarStorage, StoredAvatar } from '../../domain/shared/avatar-storage';

@Injectable()
export class S3AvatarStorage extends AvatarStorage {
  private readonly client: S3Client;
  private readonly bucket: string | undefined;
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.bucket = config.get<string>('MINIO_BUCKET');
    this.prefix = config.get<string>('AVATARS_PREFIX', 'auth-avatars/dev');
    this.client = new S3Client({
      endpoint: config.get<string>('MINIO_ENDPOINT'),
      region: config.get<string>('MINIO_REGION', 'us-east-1'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get<string>('MINIO_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async upload(userId: string, avatar: StoredAvatar): Promise<string> {
    this.assertConfigured();
    const key = this.objectKey(userId);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: avatar.body,
        ContentType: avatar.contentType,
      }),
    );
    return key;
  }

  async get(avatarKey: string): Promise<StoredAvatar | null> {
    this.assertConfigured();
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: avatarKey }));
      const body = await response.Body?.transformToByteArray();
      if (!body) {
        return null;
      }
      return { contentType: response.ContentType ?? 'application/octet-stream', body: Buffer.from(body) };
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return null;
      }
      throw error;
    }
  }

  async delete(avatarKey: string): Promise<void> {
    this.assertConfigured();
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: avatarKey }));
  }

  private objectKey(userId: string): string {
    return `${this.prefix}/${userId}`;
  }

  private assertConfigured(): void {
    if (!this.bucket) {
      throw new ServiceUnavailableException('Avatar storage is not configured (MINIO_BUCKET missing)');
    }
  }
}
