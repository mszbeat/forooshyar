import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
export function normalizePhone(raw: string) { const s = raw.trim().replace(/[\s()\-]/g, ''); if (/^09\d{9}$/u.test(s)) return `+98${s.slice(1)}`; if (/^\+989\d{9}$/u.test(s)) return s; throw new Error('شماره موبایل معتبر نیست.'); }
@Injectable()
export class SmsService {
 private logger = new Logger('SmsMock');
 constructor(private db: PrismaService, private audit: AuditService) {}
 get enabled() { return (process.env.SMS_ENABLED ?? 'true') === 'true'; }
 get otpEnabled() { return (process.env.OTP_ENABLED ?? 'false') === 'true'; }
 async send(rawPhone: string, text: string, category: string, shopId?: string, code?: string) { if (!this.enabled) return { sent: false as const }; const phone=normalizePhone(rawPhone); this.logger.log(`[MOCK SMS] ${category} ${phone.slice(0,5)}••••${phone.slice(-3)} chars=${text.length}${code && process.env.NODE_ENV !== 'production' ? ` code=${code}` : ''}`); this.audit.record({action:'sms.mock_sent',entity:'sms',shopId,meta:{category,phone:phone.slice(0,5)+'••••'+phone.slice(-3),chars:text.length}}); return {sent:true as const}; }
 async issue(rawPhone:string,purpose:string,userId?:string) { if(!this.enabled||!this.otpEnabled) return {ok:false as const}; const phone=normalizePhone(rawPhone), ttl=Math.max(60,Math.min(600,Number(process.env.OTP_TTL_SECONDS)||300)), code=String(randomInt(100000,1000000)), hash=this.hash(code); await this.db.otpChallenge.updateMany({where:{phone,purpose,consumedAt:null},data:{consumedAt:new Date()}}); await this.db.otpChallenge.create({data:{phone,purpose,userId,codeHash:hash,expiresAt:new Date(Date.now()+ttl*1000)}}); await this.send(phone,`کد فروش‌یار: ${code}`,'otp',undefined,code); return {ok:true as const,expiresIn:ttl,...(process.env.NODE_ENV!=='production'?{debugCode:code}:{})}; }
 async verify(rawPhone:string,code:string,purpose:string,userId?:string) { const phone=normalizePhone(rawPhone); const row=await this.db.otpChallenge.findFirst({where:{phone,purpose,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lt:5},...(userId?{userId}:{})},orderBy:{createdAt:'desc'}}); if(!row)return false; const a=Buffer.from(this.hash(code)),b=Buffer.from(row.codeHash); if(a.length!==b.length||!timingSafeEqual(a,b)){await this.db.otpChallenge.update({where:{id:row.id},data:{attempts:{increment:1}}});return false;} await this.db.otpChallenge.update({where:{id:row.id},data:{consumedAt:new Date()}}); return true; }
 private hash(code:string){return createHash('sha256').update(`${process.env.JWT_SECRET}:${code}`).digest('hex');}
}
