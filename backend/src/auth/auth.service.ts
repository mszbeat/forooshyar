import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AuditService } from '../logging/audit.service';
import { PrismaService } from '../database/prisma.service';
import { hashPassword, verifyPassword } from './password';
import { SmsService, normalizePhone } from '../sms/sms.service';

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService, private readonly jwt: JwtService, private readonly audit: AuditService, private readonly sms: SmsService) {}
  async register(email: string, password: string, shopName: string, phone?: string, code?: string) {
    const passwordHash = await hashPassword(password);
    let normalizedPhone: string | undefined;
    if (phone) {
      try { normalizedPhone = normalizePhone(phone); } catch { throw new UnauthorizedException('شماره موبایل معتبر نیست.'); }
      if (!this.sms.otpEnabled) throw new UnauthorizedException('ثبت‌نام با شماره موبایل فعال نیست.');
      if (!code) throw new UnauthorizedException('کد تأیید شماره موبایل را وارد کنید.');
      const taken = await this.db.user.findUnique({ where: { phone: normalizedPhone }, select: { id: true } });
      if (taken) throw new ConflictException('این شماره موبایل قبلاً ثبت شده است.');
      // کد همین‌جا تأیید و مصرف می‌شود (تأیید جداگانه در UI فقط پیش‌نمایش است).
      if (!(await this.sms.verify(normalizedPhone, code, 'register'))) {
        throw new UnauthorizedException('کد تأیید نامعتبر یا منقضی است.');
      }
    }
    try {
      const user = await this.db.user.create({
        data: {
          email, passwordHash,
          ...(normalizedPhone ? { phone: normalizedPhone, phoneVerifiedAt: new Date() } : {}),
          shop: { create: { name: shopName, ...(normalizedPhone ? { smsPhone: normalizedPhone } : {}), trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) } },
        },
        include: { shop: true },
      });
      this.audit.record({
        action: 'auth.register',
        entity: 'user',
        entityId: user.id,
        shopId: user.shop!.id,
        userId: user.id,
        meta: { email, shopName, phone: normalizedPhone ? normalizedPhone.slice(0, 5) + '••••' + normalizedPhone.slice(-3) : null },
      });
      if (normalizedPhone) {
        // پیامک خوش‌آمد نباید ثبت‌نام را خراب کند؛ fire-and-forget.
        void this.sms.send(normalizedPhone, `به فروش‌یار خوش آمدید، ${shopName}! فروشگاه شما ساخته شد. برای شروع، کاتالوگ را کامل کنید.`, 'welcome', user.shop!.id).catch(() => undefined);
      }
      return this.token(user.id, user.shop!.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('این ایمیل یا شماره موبایل قبلاً ثبت شده است.');
      throw error;
    }
  }

  /** ارسال کد تأیید برای ثبت‌نام (پیش از ساخت حساب). */
  async requestRegisterOtp(raw: string) {
    if (!this.sms.enabled || !this.sms.otpEnabled) throw new UnauthorizedException('ثبت‌نام با شماره موبایل فعال نیست.');
    let phone: string;
    try { phone = normalizePhone(raw); } catch { throw new UnauthorizedException('شماره موبایل معتبر نیست.'); }
    const taken = await this.db.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken) throw new ConflictException('این شماره موبایل قبلاً ثبت شده است.');
    return this.sms.issue(phone, 'register');
  }

  /** پیش‌نمایش تأیید کد ثبت‌نام (بدون مصرف؛ مصرف نهایی در register است). */
  async verifyRegisterOtp(raw: string, code: string) {
    if (!this.sms.otpEnabled) throw new UnauthorizedException('ثبت‌نام با شماره موبایل فعال نیست.');
    let phone: string;
    try { phone = normalizePhone(raw); } catch { throw new UnauthorizedException('شماره یا کد نادرست است.'); }
    if (!(await this.sms.verify(phone, code, 'register', undefined, false))) throw new UnauthorizedException('کد نامعتبر یا منقضی است.');
    return { ok: true as const };
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
  async requestOtp(raw:string) { if(!this.sms.enabled||!this.sms.otpEnabled) throw new UnauthorizedException('ورود OTP فعال نیست.'); let phone:string; try{phone=normalizePhone(raw)}catch{throw new UnauthorizedException('شماره معتبر نیست.')} const u=await this.db.user.findUnique({where:{phone},select:{id:true,phoneVerifiedAt:true}}); if(u?.phoneVerifiedAt) await this.sms.issue(phone,'login'); return {ok:true,message:'اگر شماره تأییدشده باشد کد ارسال می‌شود.'}; }
  async verifyOtp(raw:string,code:string) { if(!this.sms.otpEnabled) throw new UnauthorizedException('ورود OTP فعال نیست.'); let phone:string; try{phone=normalizePhone(raw)}catch{throw new UnauthorizedException('شماره یا کد نادرست است.')} if(!await this.sms.verify(phone,code,'login')) throw new UnauthorizedException('کد نامعتبر یا منقضی است.'); const u=await this.db.user.findUnique({where:{phone},include:{shop:true}}); if(!u?.phoneVerifiedAt||!u.shop?.active) throw new UnauthorizedException('شماره یا کد نادرست است.'); return this.token(u.id,u.shop.id); }
  async issuePhone(userId:string,raw:string) { if(!this.sms.enabled||!this.sms.otpEnabled) throw new UnauthorizedException('OTP فعال نیست.'); const phone=normalizePhone(raw); const exists=await this.db.user.findFirst({where:{phone,NOT:{id:userId}}}); if(exists) throw new ConflictException('شماره قبلاً استفاده شده است.'); return this.sms.issue(phone,'phone_verify',userId); }
  async verifyPhone(userId:string,raw:string,code:string) { const phone=normalizePhone(raw); if(!await this.sms.verify(phone,code,'phone_verify',userId)) throw new UnauthorizedException('کد نادرست یا منقضی است.'); await this.db.$transaction([this.db.user.update({where:{id:userId},data:{phone,phoneVerifiedAt:new Date()}}),this.db.shop.updateMany({where:{ownerId:userId},data:{smsPhone:phone}})]); return {ok:true}; }
  private async token(userId: string, shopId: string) {
    return { accessToken: await this.jwt.signAsync({ sub: userId, shopId }), tokenType: 'Bearer', expiresIn: 3600 };
  }
}
