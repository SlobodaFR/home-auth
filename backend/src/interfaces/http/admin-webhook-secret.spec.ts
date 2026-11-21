import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CreateClientUseCase } from '../../application/admin/create-client.use-case';
import { DeleteClientUseCase } from '../../application/admin/delete-client.use-case';
import { ListClientsUseCase } from '../../application/admin/list-clients.use-case';
import {
  GrantClientAccessUseCase,
  ListClientAccessUseCase,
  RevokeClientAccessUseCase,
} from '../../application/admin/manage-client-access.use-case';
import { RegenerateWebhookSecretUseCase } from '../../application/admin/regenerate-webhook-secret.use-case';
import { UpdateClientUseCase } from '../../application/admin/update-client.use-case';
import {
  InMemoryClientAccessRepository,
  InMemoryClientRepository,
  InMemoryUserRepository,
} from '../../application/test/in-memory-repositories';
import { Client } from '../../domain/client/client';
import { AdminClientsController } from './controllers/admin-clients.controller';
import { AdminGuard } from './guards/admin.guard';
import { SameOriginGuard } from './guards/same-origin.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { ClientRepository } from '../../domain/client/client.repository';
import { ClientAccessRepository } from '../../domain/client-access/client-access.repository';
import { UserRepository } from '../../domain/user/user.repository';

const allow = { canActivate: () => true };

async function createApp() {
  const clientRepository = new InMemoryClientRepository();
  await clientRepository.save(
    Client.create({
      id: 'budget',
      name: 'Foyer Budget',
      clientSecretHash: 'hash',
      redirectUris: ['https://budget.example.com/auth/callback'],
      logoutWebhookUrl: 'https://budget.example.com/hook?secret=legacy-s3cr3t',
      createdAt: new Date(),
    }),
  );
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminClientsController],
    providers: [
      { provide: ClientRepository, useValue: clientRepository },
      {
        provide: ClientAccessRepository,
        useValue: new InMemoryClientAccessRepository(),
      },
      { provide: UserRepository, useValue: new InMemoryUserRepository() },
      CreateClientUseCase,
      UpdateClientUseCase,
      ListClientsUseCase,
      RegenerateWebhookSecretUseCase,
      { provide: DeleteClientUseCase, useValue: {} },
      { provide: GrantClientAccessUseCase, useValue: {} },
      { provide: RevokeClientAccessUseCase, useValue: {} },
      { provide: ListClientAccessUseCase, useValue: {} },
    ],
  })
    .overrideGuard(SameOriginGuard)
    .useValue(allow)
    .overrideGuard(SessionAuthGuard)
    .useValue(allow)
    .overrideGuard(AdminGuard)
    .useValue(allow)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  return { app, clientRepository };
}

describe('admin webhook secret', () => {
  it('POST /admin/clients/:id/webhook-secret returns the secret, never cached', async () => {
    const { app, clientRepository } = await createApp();

    const response = await request(app.getHttpServer())
      .post('/admin/clients/budget/webhook-secret')
      .expect(201);

    expect(response.body).toEqual({
      webhookSecret: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await clientRepository.findById('budget'))?.webhookSecret).toBe(
      (response.body as { webhookSecret: string }).webhookSecret,
    );
    await app.close();
  });

  it('404 for an unknown client', async () => {
    const { app } = await createApp();

    await request(app.getHttpServer())
      .post('/admin/clients/unknown/webhook-secret')
      .expect(404);
    await app.close();
  });

  it('GET /admin/clients exposes hasWebhookSecret only, and a URL without its query', async () => {
    const { app } = await createApp();
    const server = app.getHttpServer();

    const before = await request(server).get('/admin/clients').expect(200);
    expect((before.body as { hasWebhookSecret: boolean }[])[0]).toMatchObject({
      id: 'budget',
      hasWebhookSecret: false,
      logoutWebhookUrl: 'https://budget.example.com/hook?***',
    });

    const regenerated = await request(server)
      .post('/admin/clients/budget/webhook-secret')
      .expect(201);
    const secret = (regenerated.body as { webhookSecret: string })
      .webhookSecret;
    await request(server).post('/admin/clients/budget/webhook-secret');

    const after = await request(server).get('/admin/clients').expect(200);
    const text = JSON.stringify(after.body);
    expect((after.body as { hasWebhookSecret: boolean }[])[0]).toMatchObject({
      hasWebhookSecret: true,
    });
    expect(text).not.toContain(secret);
    expect(text).not.toContain('legacy-s3cr3t');
    expect(text).not.toMatch(/webhookSecret"/);
    expect(text).not.toContain('Previous');
    await app.close();
  });

  it('PATCH answers with the masked URL and keeps the stored query', async () => {
    const { app, clientRepository } = await createApp();

    const response = await request(app.getHttpServer())
      .patch('/admin/clients/budget')
      .send({ logoutWebhookUrl: 'https://budget.example.com/hook?***' })
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain('legacy-s3cr3t');
    expect((await clientRepository.findById('budget'))?.logoutWebhookUrl).toBe(
      'https://budget.example.com/hook?secret=legacy-s3cr3t',
    );
    await app.close();
  });

  it('POST /admin/clients (create) never returns a webhook secret either', async () => {
    const { app } = await createApp();

    const response = await request(app.getHttpServer())
      .post('/admin/clients')
      .send({
        id: 'chat',
        name: 'Chat',
        redirectUris: ['https://chat.example.com/cb'],
        logoutWebhookUrl: 'https://chat.example.com/hook?secret=zzz',
      })
      .expect(201);

    const body = response.body as {
      client: Record<string, unknown>;
      clientSecret: string;
    };
    expect(body.client).toMatchObject({
      hasWebhookSecret: false,
      logoutWebhookUrl: 'https://chat.example.com/hook?***',
    });
    expect(JSON.stringify(body.client)).not.toContain('zzz');
    await app.close();
  });
});
