import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReadinessService } from './readiness.service';

@Controller('ready')
export class ReadinessController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get()
  async getReadiness(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.readinessService.check();
    response.status(readiness.status === 'ready' ? 200 : 503);
    return readiness;
  }
}
