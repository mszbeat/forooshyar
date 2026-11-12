import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse, text } from '../common/validation';
import { AssistantService } from './assistant.service';

type Request = { principal: Principal };

const knowledgeSchema = z.object({
  question: text,
  answer: text,
  keywords: z.string().trim().max(500).optional(),
}).strict();

const knowledgeUpdateSchema = z.object({
  question: text.optional(),
  answer: text.optional(),
  keywords: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
}).strict().refine(v => Object.keys(v).length > 0);

const promptSchema = z.object({
  tab: z.enum(['role', 'tone', 'flow']),
  content: z.string().trim().min(1).max(8000),
}).strict();

@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('knowledge') listKnowledge(@Req() req: Request) {
    return this.assistant.listKnowledge(req.principal.shopId);
  }

  @Post('knowledge') createKnowledge(@Req() req: Request, @Body() body: unknown) {
    return this.assistant.createKnowledge(req.principal.shopId, parse(knowledgeSchema, body));
  }

  @Patch('knowledge/:id') updateKnowledge(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.assistant.updateKnowledge(req.principal.shopId, id, parse(knowledgeUpdateSchema, body));
  }

  @Delete('knowledge/:id') deleteKnowledge(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistant.deleteKnowledge(req.principal.shopId, id);
  }

  @Get('prompts') prompts(@Req() req: Request) {
    return this.assistant.prompts(req.principal.shopId);
  }

  @Get('prompts/:tab/history') promptHistory(@Req() req: Request, @Param('tab') tab: string) {
    return this.assistant.promptHistory(req.principal.shopId, tab);
  }

  @Post('prompts') savePrompt(@Req() req: Request, @Body() body: unknown) {
    const input = parse(promptSchema, body);
    return this.assistant.savePrompt(req.principal.shopId, input.tab, input.content);
  }

  @Post('prompts/:tab/reset') resetPrompt(@Req() req: Request, @Param('tab') tab: string) {
    return this.assistant.resetPrompt(req.principal.shopId, tab);
  }
}
