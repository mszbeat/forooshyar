import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { bindPrincipal } from '../logging/request-context';
import type { AdminIdentity } from './admin.service';

/**
 * نگهبان پنل ادمین.
 *
 * تفاوت عمدی با `AuthGuard` فروشنده: توکن ادمین هیچ `shopId` ندارد و در آن
 * `kind: 'admin'` است. پس توکن فروشنده هرگز به مسیرهای ادمین نمی‌رسد و برعکس
 * (AuthGuard فروشنده هم `shopId` می‌خواهد و آن را در توکن ادمین نمی‌بیند).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; admin?: AdminIdentity }>();
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(match[1], { algorithms: ['HS256'] });
      const parsed = z.object({ sub: z.string().uuid(), kind: z.literal('admin') }).parse(payload);
      const admin = await this.db.platformAdmin.findUnique({
        where: { id: parsed.sub },
        select: { id: true, email: true, name: true },
      });
      if (!admin) throw new UnauthorizedException();
      request.admin = admin;
      // ادمین فروشگاه ندارد؛ برای لاگ گردش فقط کاربر را می‌بندیم.
      bindPrincipal({ userId: admin.id });
      return true;
    } catch {
      throw new UnauthorizedException('نشست ادمین معتبر نیست؛ دوباره وارد شوید.');
    }
  }
}
