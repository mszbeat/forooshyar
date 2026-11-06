import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../database/prisma.service';

const scrypt = promisify(scryptCallback);
async function hashPassword(password: string, salt = randomBytes(16).toString('hex')): Promise<string> {
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, hex] = encoded.split(':');
  if (!salt || !hex) return false;
  const key = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService, private readonly jwt: JwtService) {}
  async register(email: string, password: string, shopName: string) {
    const passwordHash = await hashPassword(password);
    try {
      const user = await this.db.user.create({ data: { email, passwordHash, shop: { create: { name: shopName } } }, include: { shop: true } });
      return this.token(user.id, user.shop!.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Registration failed');
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email }, include: { shop: true } });
    if (!user || !user.shop || !(await verifyPassword(password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials');
    return this.token(user.id, user.shop.id);
  }
  private async token(userId: string, shopId: string) {
    return { accessToken: await this.jwt.signAsync({ sub: userId, shopId }), tokenType: 'Bearer', expiresIn: 3600 };
  }
}
