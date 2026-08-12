import { ForbiddenException } from '@nestjs/common';
import { CollectorWorkspaceController } from './collector-workspace.controller';

describe('CollectorWorkspaceController', () => {
  const workspace = {
    overview: jest.fn(),
    collectibles: jest.fn(),
    collectibleDetail: jest.fn(),
    requests: jest.fn(),
    documents: jest.fn(),
    search: jest.fn(),
    updatePublicProfile: jest.fn(),
  };
  const controller = new CollectorWorkspaceController(workspace as never);

  it('allows collectors and admins through the workspace boundary', () => {
    expect(
      controller.overview({
        actor: { userId: 'collector-1', roles: ['USER', 'COLLECTOR'] },
      } as never),
    ).toBeUndefined();
    expect(
      controller.overview({
        actor: { userId: 'admin-1', roles: ['ADMIN'] },
      } as never),
    ).toBeUndefined();
    expect(workspace.overview).toHaveBeenLastCalledWith('admin-1');
  });

  it('rejects investor-only access before any workspace projection is read', () => {
    expect(() =>
      controller.overview({
        actor: { userId: 'investor-1', roles: ['USER'] },
      } as never),
    ).toThrow(ForbiddenException);
    expect(workspace.overview).not.toHaveBeenCalledWith('investor-1');
  });
});
