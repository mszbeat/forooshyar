import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuditService } from '../logging/audit.service';
import { PrismaService } from '../database/prisma.service';
import { hashPassword, verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService, private readonly jwt: JwtService, private readonly audit: AuditService) {}
  async register(email: string, password: string, shopName: string) {
    const passwordHash = await hashPassword(password);
    try {
      const user = await this.db.user.create({ data: { email, passwordHash, shop: { create: { name: shopName, trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) } } }, include: { shop: true } });
      this.audit.record({
        action: 'auth.register',
        entity: 'user',
        entityId: user.id,
        shopId: user.shop!.id,
        userId: user.id,
        meta: { email, shopName },
      });
      return this.token(user.id, user.shop!.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('این ایمیل قبلاً ثبت شده است.');
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email }, include: { shop: true } });
    if (!user || !user.shop || !user.shop.active || !(await verifyPassword(password, user.passwordHash))) {
      this.audit.record({ action: 'auth.login_failed', entity: 'user', meta: { email, reason: !user ? 'unknown_email' : !user.shop ? 'no_shop' : !user.shop.active ? 'inactive_shop' : 'bad_password' } });
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است.');
    }
    this.audit.record({ action: 'auth.login', entity: 'user', entityId: user.id, shopId: user.shop.id, userId: user.id, meta: { email } });
    return this.token(user.id, user.shop.id);
  }
  private async token(userId: string, shopId: string) {
    return { accessToken: await this.jwt.signAsync({ sub: userId, shopId }), tokenType: 'Bearer', expiresIn: 3600 };
  }
}
