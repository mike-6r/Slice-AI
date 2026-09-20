import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config';
import type { PreSaleService } from './application/pre-sale.service';
import { PreSaleWorker } from './pre-sale.worker';

describe('PreSaleWorker failure containment', () => {
  let worker: PreSaleWorker;
  let presales: {
    syncPhysicalStatuses: jest.Mock;
    expireDue: jest.Mock;
  };
  let log: jest.SpyInstance;
  const create = (config: Partial<AppConfig> = {}) =>
    new PreSaleWorker(
      presales as unknown as PreSaleService,
      {
        environment: 'development',
        deploymentChannel: 'staging',
        ...config,
      } as AppConfig,
    );

  beforeEach(() => {
    jest.useFakeTimers();
    presales = {
      syncPhysicalStatuses: jest.fn().mockResolvedValue(0),
      expireDue: jest.fn().mockResolvedValue(0),
    };
    log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    worker = create();
  });
  afterEach(() => {
    worker.onApplicationShutdown();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('contains the observed expiry failure and retries on the next scheduled run', async () => {
    presales.expireDue.mockRejectedValueOnce(
      new Error('AUDIT_METADATA_NOT_PERMITTED'),
    );
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(log).toHaveBeenCalledWith({
      code: 'PRE_SALE_WORKER_RUN_FAILED',
      phase: 'expiry',
      cause: 'AUDIT_METADATA_NOT_PERMITTED',
    });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(presales.expireDue).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('does not run expiry after a failed sync or log raw sensitive errors', async () => {
    presales.syncPhysicalStatuses.mockRejectedValueOnce(
      new Error('postgres://private-connection'),
    );
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(presales.expireDue).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      code: 'PRE_SALE_WORKER_RUN_FAILED',
      phase: 'physical-status',
      cause: 'BACKGROUND_OPERATION_FAILED',
    });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(presales.expireDue).toHaveBeenCalledTimes(1);
  });

  it('does not overlap runs or register duplicate polling timers', async () => {
    let resolve!: (value: number) => void;
    presales.syncPhysicalStatuses.mockImplementationOnce(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        }),
    );
    worker.onModuleInit();
    worker.onModuleInit();
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(presales.syncPhysicalStatuses).toHaveBeenCalledTimes(1);
    resolve(0);
    await jest.advanceTimersByTimeAsync(0);
    expect(presales.expireDue).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(presales.syncPhysicalStatuses).toHaveBeenCalledTimes(2);
  });

  it('stops polling and does not begin expiry after shutdown during a sync', async () => {
    let resolve!: (value: number) => void;
    presales.syncPhysicalStatuses.mockImplementationOnce(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        }),
    );
    worker.onModuleInit();
    worker.onApplicationShutdown();
    resolve(0);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(presales.expireDue).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([
    { environment: 'test' as const },
    { deploymentChannel: 'preview' as const },
  ])('does not start background mutations in %j', async (config) => {
    worker = create(config);
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(presales.syncPhysicalStatuses).not.toHaveBeenCalled();
    expect(presales.expireDue).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
