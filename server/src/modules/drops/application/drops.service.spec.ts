import { NotFoundException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import { DropsService } from './drops.service';

describe('DropsService preview boundary', () => {
  it('fails closed before touching persistence outside /preview', async () => {
    const db = { drop: { findMany: jest.fn() } };
    const config = {
      deploymentChannel: 'staging',
      publicBasePath: '/',
    } as AppConfig;
    const service = new DropsService(db as never, config);

    await expect(service.listPublic()).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.drop.findMany).not.toHaveBeenCalled();
  });
});
