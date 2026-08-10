import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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
}
