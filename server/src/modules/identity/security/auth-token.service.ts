import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';

export type AccessClaims = { sub: string; sid: string; jti: string };

@Injectable()
export class AuthTokenService {
  private readonly jwt: JwtService;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.jwt = new JwtService({ secret: config.jwtAccessSecret });
  }
  issue(userId: string, sessionId: string) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, jti: randomUUID() },
      {
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        expiresIn: this.config.accessTokenTtlSeconds,
      },
    );
  }
  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        algorithms: ['HS256'],
      });
      return typeof claims.sub === 'string' && typeof claims.sid === 'string'
        ? claims
        : null;
    } catch {
      return null;
    }
  }
  createOpaqueRefreshToken() {
    return randomBytes(32).toString('base64url');
  }
  hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
