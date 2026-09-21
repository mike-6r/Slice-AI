import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { DropsService } from '../application/drops.service';

const draftInput = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(20).max(2_000),
  })
  .strict();
const updateInput = draftInput
  .extend({ version: z.number().int().positive() })
  .strict();
const inventoryInput = z
  .object({
    assetId: z.string().min(1).max(128),
    version: z.number().int().positive(),
  })
  .strict();
const versionInput = z
  .object({ version: z.number().int().positive() })
  .strict();
const transitionInput = versionInput
  .extend({
    target: z.enum(['READY_TO_PUBLISH', 'LIVE', 'CLOSED', 'CANCELLED']),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();

@Controller()
export class DropsController {
  constructor(private readonly drops: DropsService) {}

  @Get('drops')
  listPublic() {
    return this.drops.listPublic();
  }

  @Get('drops/:reference')
  publicDetail(@Param('reference') reference: string) {
    return this.drops.publicDetail(reference);
  }

  @Get('creator/drops')
  @UseGuards(AccessTokenGuard)
  creatorDrops(@Req() req: AuthenticatedRequest) {
    return this.drops.creatorDrops(req.actor!);
  }

  @Get('creator/drops/eligible-assets')
  @UseGuards(AccessTokenGuard)
  eligibleAssets(@Req() req: AuthenticatedRequest) {
    return this.drops.eligibleAssets(req.actor!);
  }

  @Get('creator/drops/:id')
  @UseGuards(AccessTokenGuard)
  creatorDrop(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.drops.creatorDrop(req.actor!, id);
  }

  @Post('creator/drops')
  @UseGuards(AccessTokenGuard)
  createDraft(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.drops.createDraft(
      req.actor!,
      this.parse(draftInput, body),
      this.key(key),
    );
  }

  @Patch('creator/drops/:id')
  @UseGuards(AccessTokenGuard)
  updateDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.drops.updateDraft(
      req.actor!,
      id,
      this.parse(updateInput, body),
      this.key(key),
    );
  }

  @Post('creator/drops/:id/inventory')
  @UseGuards(AccessTokenGuard)
  addInventory(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.drops.addInventory(
      req.actor!,
      id,
      this.parse(inventoryInput, body),
      this.key(key),
    );
  }

  @Delete('creator/drops/:id/inventory/:assetId')
  @UseGuards(AccessTokenGuard)
  removeInventory(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.drops.removeInventory(
      req.actor!,
      id,
      assetId,
      this.parse(versionInput, body),
      this.key(key),
    );
  }

  @Post('creator/drops/:id/submit')
  @UseGuards(AccessTokenGuard)
  submit(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.drops.submitForReview(
      req.actor!,
      id,
      this.parse(versionInput, body),
      this.key(key),
    );
  }

  @Get('admin/drops')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('admin.console.read')
  adminDrops(@Req() req: AuthenticatedRequest) {
    return this.drops.adminDrops(req.actor!);
  }

  @Get('admin/drops/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('admin.console.read')
  adminDrop(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.drops.adminDrop(req.actor!, id);
  }

  @Post('admin/drops/:id/transition')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('admin.console.read')
  adminTransition(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.drops.adminTransition(
      req.actor!,
      id,
      this.parse(transitionInput, body),
      this.key(key),
    );
  }

  private key(value: string | undefined): string {
    if (!value || !/^[\x21-\x7e]{1,128}$/.test(value))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return value;
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: result.error.flatten().fieldErrors,
      });
    return result.data;
  }
}
