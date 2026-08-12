import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/auth/access-token.guard';
import { PermissionGuard } from '../identity/access/permission.guard';
import { RequirePermission } from '../identity/access/permission.decorator';
import { AdminService } from './admin.service';

const page = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: z.string().trim().max(40).optional(),
    status: z.string().trim().max(40).optional(),
    cursor: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const boundedSearch = z
  .object({
    q: z.string().trim().min(2).max(120),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @RequirePermission('admin.console.read')
  overview(@Req() request: AuthenticatedRequest) {
    return this.admin.overview(request.actor!);
  }

  @Get('users')
  @RequirePermission('users.read')
  users(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(page, query);
    return this.admin.listUsers(request.actor!, {
      ...input,
      limit: input.limit ?? 25,
    });
  }

  @Get('users/:id')
  @RequirePermission('users.read')
  user(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.admin.userDetail(request.actor!, id);
  }

  @Get('compliance/cases')
  @RequirePermission('compliance.read')
  compliance(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(page.pick({ limit: true }), query);
    return this.admin.complianceCases(request.actor!, input.limit ?? 25);
  }

  @Get('finance/summary')
  @RequirePermission('finance.read')
  finance(@Req() request: AuthenticatedRequest) {
    return this.admin.financeSummary(request.actor!);
  }

  @Get('integrations')
  @RequirePermission('integrations.read')
  integrations(@Req() request: AuthenticatedRequest) {
    return this.admin.integrations(request.actor!);
  }

  @Get('search')
  @RequirePermission('admin.console.read')
  search(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(boundedSearch, query);
    return this.admin.search(request.actor!, input.q, input.limit ?? 20);
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return parsed.data;
  }
}
