import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse, text } from '../common/validation';
import { ChannelsService } from './channels.service';

type Request = { principal: Principal };

const connectSchema = z.object({
  platform: z.enum(['INSTAGRAM', 'TELEGRAM', 'BALE', 'RUBIKA']),
  externalId: text,
  displayName: z.string().trim().max(200).optional(),
  username: z.string().trim().max(200).optional(),
  avatarUrl: z.string().trim().max(2000).optional(),
  secret: z.string().trim().min(10).max(500).optional(),
  expiresAt: z.string().trim().max(50).optional(),
}).strict();

@Controller('channels')
@UseGuards(AuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get() list(@Req() req: Request) {
    return this.channels.list(req.principal.shopId);
  }

  @Post('connect') connect(@Req() req: Request, @Body() body: unknown) {
    return this.channels.connect(req.principal.shopId, parse(connectSchema, body));
  }

  @Patch(':id/disconnect') disconnect(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.channels.disconnect(req.principal.shopId, id);
  }

  @Delete(':id') remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.channels.remove(req.principal.shopId, id);
  }
}
