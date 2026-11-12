import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { ChatService } from './chat.service';

/** گفتگوها و مشتریان؛ فقط برای فروشنده‌ی همان فروشگاه. */
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  conversations(@Req() req: { principal: Principal }) {
    return this.chat.conversations(req.principal.shopId);
  }

  @Get('conversations/:chatId')
  thread(@Req() req: { principal: Principal }, @Param('chatId') chatId: string) {
    return this.chat.thread(req.principal.shopId, chatId);
  }

  @Post('conversations/:chatId/reply')
  async reply(
    @Req() req: { principal: Principal },
    @Param('chatId') chatId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ text: z.string().trim().min(1, 'متن پیام خالی است.').max(2000) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'متن پیام معتبر نیست.');
    return this.chat.reply(req.principal.shopId, req.principal.userId, chatId, parsed.data.text);
  }

  @Patch('conversations/:chatId/takeover')
  async takeover(
    @Req() req: { principal: Principal },
    @Param('chatId') chatId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ takeover: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('مقدار takeover معتبر نیست.');
    return this.chat.setTakeover(req.principal.shopId, req.principal.userId, chatId, parsed.data.takeover);
  }

  @Get('customers')
  customers(@Req() req: { principal: Principal }, @Query('take') take?: string) {
    const parsed = Number(take);
    return this.chat.customers(req.principal.shopId, Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 200);
  }
}
