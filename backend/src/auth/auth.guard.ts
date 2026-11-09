import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { z } from 'zod';
import { bindPrincipal } from '../logging/request-context';

export interface Principal { userId: string; shopId: string }
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      query?: Record<string, unknown>;
      principal?: Principal;
    }>();
    // `EventSource` مرورگر نمی‌تواند هدر بفرستد، پس برای جریان زنده توکن از
    // query خوانده می‌شود. پذیرش توکن از query فقط در همین نگهبان و برای همهٔ
    // مسیرها بی‌خطر است چون اعتبارسنجی و بررسی مالکیت فروشگاه همین‌جا انجام
    // می‌شود؛ در عوض امکان «هر مسیری با ?token» به‌وجود نمی‌آید — همان JWT لازم است.
    const fromQuery = typeof request.query?.token === 'string' ? request.query.token : '';
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '') ?? (fromQuery ? [fromQuery, fromQuery] : null);
    if (!match) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(match[1], { algorithms: ['HS256'] });
      const parsed = z.object({ sub: z.string().uuid(), shopId: z.string().uuid() }).parse(payload);
      const shop = await this.db.shop.findFirst({ where: { id: parsed.shopId, ownerId: parsed.sub }, select: { id: true } });
      if (!shop) throw new UnauthorizedException();
      request.principal = { userId: parsed.sub, shopId: parsed.shopId };
      bindPrincipal(request.principal);
      return true;
    } catch { throw new UnauthorizedException(); }
  }
}
