import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { AccountCapabilityService } from './account-capability.service';

@Controller('me')
export class AccountCapabilityController {
  constructor(private readonly capabilities: AccountCapabilityService) {}

  @Get('capabilities')
  @UseGuards(AccessTokenGuard)
  self(@Req() request: AuthenticatedRequest) {
    return this.capabilities.summary(request.actor!);
  }

  /**
   * Controlled-beta collector conversion. This is deliberately available only
   * when the server is running in Beta; production role assignment remains an
   * admin-controlled operation.
   */
  @Post('collector-beta-access')
  @UseGuards(AccessTokenGuard)
  grantCollectorBeta(@Req() request: AuthenticatedRequest) {
    return this.capabilities.grantCollectorBeta(request.actor!, request.requestId);
  }
}
