import * as request from 'supertest';

export async function communityHttp(input: {
  server: unknown;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  authorization?: string;
  clientIp?: string;
  idempotencyKey?: string;
  body?: Record<string, string>;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const agent = request(input.server as never);
  const pending =
    input.method === 'GET'
      ? agent.get(input.path)
      : input.method === 'PUT'
        ? agent.put(input.path)
        : agent.post(input.path);
  if (input.authorization) pending.set('authorization', input.authorization);
  if (input.clientIp) pending.set('x-forwarded-for', input.clientIp);
  if (input.idempotencyKey) pending.set('idempotency-key', input.idempotencyKey);
  const response = await pending.send(input.body ?? {});
  return { status: response.status, body: response.body as Record<string, unknown> };
}
