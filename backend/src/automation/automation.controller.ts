import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse, text } from '../common/validation';
import { AutomationService } from './automation.service';

type Request = { principal: Principal };

const automationSchema = z.object({
  name: text.optional(),
  active: z.boolean().optional(),
  scope: z.enum(['ALL', 'SELECTED']).optional(),
  mediaIds: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  triggerWords: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  publicReplies: z.array(z.string().trim().min(1).max(1000)).max(3).optional(),
  dmTemplate: z.string().max(4000).optional(),
  productId: z.string().uuid().nullable().optional(),
  requireFollow: z.boolean().optional(),
  dailyCap: z.number().int().min(1).max(10000).optional(),
}).strict();

const testSchema = z.object({ text: text }).strict();

@Controller('automations')
@UseGuards(AuthGuard)
export class AutomationController {
  constructor(private readonly automations: AutomationService) {}

  @Get() list(@Req() req: Request) {
    return this.automations.list(req.principal.shopId);
  }

  @Post() create(@Req() req: Request, @Body() body: unknown) {
    return this.automations.create(req.principal.shopId, parse(automationSchema, body));
  }

  @Patch(':id') update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.automations.update(req.principal.shopId, id, parse(automationSchema, body));
  }

  @Delete(':id') remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.automations.remove(req.principal.shopId, id);
  }

  @Get(':id/runs') runs(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.automations.runs(req.principal.shopId, id);
  }

  @Post(':id/test-trigger') testTrigger(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.automations.testTrigger(req.principal.shopId, id, parse(testSchema, body).text);
  }
}
