import { BadRequestException, Body, Controller, Get, Post, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { AdminIdentity } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { SettingsService } from './settings.service';

type AuthedRequest = { admin?: AdminIdentity };

/** ورود ادمین — بدون نگهبان، چون توکن هنوز وجود ندارد. */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admin: AdminService) {}

  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = z.object({
      email: z.string().trim().min(3).max(200),
      password: z.string().min(4).max(200),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('ایمیل و رمز را کامل وارد کنید.');
    return this.admin.login(parsed.data.email, parsed.data.password);
  }
}

/**
 * مسیرهای پنل ادمین.
 *
 * همه‌ی این مسیرها با `AdminGuard` محافظت می‌شوند و هر تغییر در دفتر گردش با
 * اکشن `admin.*` ثبت می‌شود.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly settings: SettingsService) {}

  private static who(request: AuthedRequest): AdminIdentity {
    if (!request.admin) throw new UnauthorizedException();
    return request.admin;
  }

  @Get('auth/me')
  me(@Req() request: AuthedRequest) {
    return this.admin.me(AdminController.who(request).id);
  }

  @Post('auth/password')
  async password(@Req() request: AuthedRequest, @Body() body: unknown) {
    const who = AdminController.who(request);
    const parsed = z.object({
      current: z.string().min(1),
      next: z.string().min(10, 'رمز تازه باید حداقل ۱۰ کاراکتر باشد.').max(200),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.');
    return this.admin.changePassword(who.id, parsed.data.current, parsed.data.next);
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('settings')
  list() {
    return this.settings.list();
  }

  @Put('settings')
  async save(@Req() request: AuthedRequest, @Body() body: unknown) {
    const who = AdminController.who(request);
    const parsed = z.object({ values: z.record(z.string(), z.string().max(4000)) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('قالب درخواست درست نیست.');
    return this.settings.save(parsed.data.values, who);
  }

  @Post('diagnostics/ai')
  probeAi(@Body() body: unknown) {
    // baseUrl/model/apiKey اختیاری: آزمون مقدارهای ذخیره‌نشده‌ی فرم، بدون نوشتن در دیتابیس.
    const parsed = z.object({
      baseUrl: z.string().max(500).optional(),
      model: z.string().max(200).optional(),
      apiKey: z.string().max(500).optional(),
    }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('مقادیر آزمون نامعتبر است.');
    const clean: { baseUrl?: string; model?: string; apiKey?: string } = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      const text = (value ?? '').trim();
      if (text) clean[key as 'baseUrl'] = text;
    }
    return this.admin.probeAi(clean);
  }

  /**
   * فهرست زندهٔ مدل‌های یک درگاه.
   * `baseUrl`/`apiKey` اختیاری‌اند تا فرمِ ذخیره‌نشده هم فهرست درست را ببیند.
   */
  @Get('ai/models')
  aiModels(@Query() query: Record<string, unknown>) {
    const parsed = z.object({
      provider: z.string().max(60).optional(),
      baseUrl: z.string().max(500).optional(),
      apiKey: z.string().max(500).optional(),
      refresh: z.string().max(6).optional(),
    }).safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException('پرس‌وجوی فهرست مدل‌ها نامعتبر است.');
    return this.admin.aiModels({
      provider: (parsed.data.provider ?? 'openrouter').trim(),
      baseUrl: parsed.data.baseUrl?.trim() || undefined,
      apiKey: parsed.data.apiKey?.trim() || undefined,
      refresh: parsed.data.refresh === '1',
    });
  }

  @Post('diagnostics/telegram')
  probeTelegram() {
    return this.admin.probeTelegram();
  }

  @Post('diagnostics/database')
  async probeDatabase(@Body() body: unknown) {
    const parsed = z.object({ url: z.string().max(2000).optional() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('آدرس نامعتبر است.');
    return this.admin.probeDatabase(parsed.data.url ?? '');
  }

  @Get('database')
  database() {
    return this.admin.databaseInfo();
  }

  /** ری‌استارت سرویس برای اعمال تنظیماتی که اتصالشان از پیش ساخته شده است. */
  @Post('restart')
  restart(@Req() request: AuthedRequest) {
    return this.admin.restart(AdminController.who(request));
  }
}
