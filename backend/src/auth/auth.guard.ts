import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { z } from 'zod';

export interface Principal { userId: string; shopId: string }
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; principal?: Principal }>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(match[1], { algorithms: ['HS256'] });
      const parsed = z.object({ sub: z.string().uuid(), shopId: z.string().uuid() }).parse(payload);
      const shop = await this.db.shop.findFirst({ where: { id: parsed.shopId, ownerId: parsed.sub }, select: { id: true } });
      if (!shop) throw new UnauthorizedException();
      request.principal = { userId: parsed.sub, shopId: parsed.shopId };
      return true;
    } catch { throw new UnauthorizedException(); }
  }
}
