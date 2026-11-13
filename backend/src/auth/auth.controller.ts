import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { parse, text } from '../common/validation';
import { AuthService } from './auth.service';
import { AuthGuard, Principal } from './auth.guard';
const credentials = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) }).strict();
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register') register(@Body() body: unknown) {
    const input = parse(credentials.extend({
      shopName: text,
      phone: z.string().min(8).max(20).optional(),
      code: z.string().regex(/^\d{6}$/u).optional(),
    }), body);
    return this.auth.register(input.email, input.password, input.shopName, input.phone, input.code);
  }
  @Throttle({ default: { limit: 3, ttl: 60000 } }) @Post('register/otp/request') requestRegisterOtp(@Body() b: unknown) { const x=parse(z.object({phone:z.string().min(8).max(20)}),b); return this.auth.requestRegisterOtp(x.phone); }
  @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('register/otp/verify') verifyRegisterOtp(@Body() b: unknown) { const x=parse(z.object({phone:z.string().min(8).max(20),code:z.string().regex(/^\d{6}$/u)}),b); return this.auth.verifyRegisterOtp(x.phone,x.code); }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login') login(@Body() body: unknown) {
    const input = parse(credentials, body);
    return this.auth.login(input.email, input.password);
  }
  @Throttle({ default: { limit: 3, ttl: 60000 } }) @Post('otp/request') requestOtp(@Body() b: unknown) { const x=parse(z.object({phone:z.string().min(8).max(20)}),b); return this.auth.requestOtp(x.phone); }
  @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('otp/verify') verifyOtp(@Body() b: unknown) { const x=parse(z.object({phone:z.string().min(8).max(20),code:z.string().regex(/^\d{6}$/u)}),b); return this.auth.verifyOtp(x.phone,x.code); }
  @UseGuards(AuthGuard) @Post('phone/otp/request') issuePhone(@Req() r:{principal:Principal},@Body() b:unknown) { const x=parse(z.object({phone:z.string().min(8).max(20)}),b); return this.auth.issuePhone(r.principal.userId,x.phone); }
  @UseGuards(AuthGuard) @Post('phone/otp/verify') verifyPhone(@Req() r:{principal:Principal},@Body() b:unknown) { const x=parse(z.object({phone:z.string().min(8).max(20),code:z.string().regex(/^\d{6}$/u)}),b); return this.auth.verifyPhone(r.principal.userId,x.phone,x.code); }

}
