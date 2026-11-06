import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { parse, text } from '../common/validation';
import { AuthService } from './auth.service';
const credentials = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128) }).strict();
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register') register(@Body() body: unknown) {
    const input = parse(credentials.extend({ shopName: text }), body);
    return this.auth.register(input.email, input.password, input.shopName);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login') login(@Body() body: unknown) {
    const input = parse(credentials, body);
    return this.auth.login(input.email, input.password);
  }
}
