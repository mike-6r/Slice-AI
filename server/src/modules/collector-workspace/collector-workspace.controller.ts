import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/auth/access-token.guard';
import { CollectorWorkspaceService } from './collector-workspace.service';

const profilePatch = z
  .object({
    headline: z.string().trim().max(500).nullable().optional(),
    specialism: z.string().trim().max(240).nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required.',
  );

const searchQuery = z
  .object({ query: z.string().trim().min(1).max(120) })
  .strict();

@Controller('collector-workspace')
@UseGuards(AccessTokenGuard)
export class CollectorWorkspaceController {
  constructor(private readonly workspace: CollectorWorkspaceService) {}

  @Get('overview')
  overview(@Req() request: AuthenticatedRequest) {
    return this.workspace.overview(this.collectorId(request));
  }

  @Get('collectibles')
  collectibles(@Req() request: AuthenticatedRequest) {
    return this.workspace.collectibles(this.collectorId(request));
  }

  @Get('collectibles/:id')
  collectibleDetail(
    @Param('id') submissionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workspace.collectibleDetail(
      this.collectorId(request),
      submissionId,
    );
  }

  @Get('requests')
  requests(@Req() request: AuthenticatedRequest) {
    return this.workspace.requests(this.collectorId(request));
  }

  @Get('documents')
  documents(@Req() request: AuthenticatedRequest) {
    return this.workspace.documents(this.collectorId(request));
  }

  @Get('search')
  search(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.workspace.search(
      this.collectorId(request),
      searchQuery.parse(query).query,
    );
  }

  @Patch('profile')
  updateProfile(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.workspace.updatePublicProfile(
      this.collectorId(request),
      profilePatch.parse(body),
    );
  }

  private collectorId(request: AuthenticatedRequest) {
    const actor = request.actor;
    if (
      !actor ||
      (!actor.roles.includes('COLLECTOR') && !actor.roles.includes('ADMIN'))
    )
      throw new ForbiddenException({
        code: 'COLLECTOR_WORKSPACE_ACCESS_REQUIRED',
        message: 'Collector workspace access is required.',
      });
    return actor.userId;
  }
}
