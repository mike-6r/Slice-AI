import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
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

const shipmentInput = z.object({
  carrier: z.string().trim().min(2).max(40),
  trackingNumber: z.string().trim().min(3).max(120),
  shippedAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
}).strict();

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

  @Get('subscription')
  subscription(@Req() request: AuthenticatedRequest) {
    return this.workspace.subscription(this.collectorId(request));
  }

  @Get('plans')
  plans() {
    return this.workspace.plans();
  }

  @Post('subscription/checkout')
  checkout(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = z.object({ planCode: z.enum(['STARTER', 'PRO', 'ELITE']) }).strict().parse(body);
    return this.workspace.subscriptionAction(this.collectorId(request), 'CHECKOUT', input.planCode);
  }

  @Post('subscription/portal')
  billingPortal(@Req() request: AuthenticatedRequest) {
    return this.workspace.subscriptionAction(this.collectorId(request), 'PORTAL');
  }

  @Post('subscription/change-plan')
  changePlan(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = z.object({ planCode: z.enum(['STARTER', 'PRO', 'ELITE']) }).strict().parse(body);
    return this.workspace.subscriptionAction(this.collectorId(request), 'CHANGE_PLAN', input.planCode);
  }

  @Post('subscription/cancel')
  cancelSubscription(@Req() request: AuthenticatedRequest) {
    return this.workspace.subscriptionAction(this.collectorId(request), 'CANCEL');
  }

  @Post('subscription/resume')
  resumeSubscription(@Req() request: AuthenticatedRequest) {
    return this.workspace.subscriptionAction(this.collectorId(request), 'RESUME');
  }

  @Get('vaults')
  vaults() {
    return this.workspace.vaults();
  }

  @Post('collectibles/:id/vault')
  selectVault(@Param('id') submissionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = z.object({ vaultId: z.string().min(1) }).strict().parse(body);
    return this.workspace.selectVault(this.collectorId(request), submissionId, input.vaultId);
  }

  @Post('collectibles/:id/shipment')
  addShipment(@Param('id') submissionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.workspace.addShipment(this.collectorId(request), submissionId, shipmentInput.parse(body));
  }

  @Post('collectibles/:id/delete-draft')
  deleteDraft(@Param('id') submissionId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = z.object({ version: z.number().int().min(1) }).strict().parse(body);
    return this.workspace.deleteDraft(this.collectorId(request), submissionId, input.version);
  }

  @Post('intake/:id/receipt')
  confirmReceipt(@Param('id') intakeId: string, @Req() request: AuthenticatedRequest) {
    const actor = request.actor;
    if (!actor) throw new ForbiddenException({ code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
    return this.workspace.confirmReceipt(actor.userId, intakeId, actor.roles);
  }

  @Patch('intake/:id/shipment')
  updateShipmentStatus(@Param('id') intakeId: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const actor = request.actor;
    if (!actor) throw new ForbiddenException({ code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' });
    const input = z.object({ status: z.enum(['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'UNKNOWN']) }).strict().parse(body);
    return this.workspace.updateShipmentStatus(actor.roles, intakeId, input.status);
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
