import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse, text } from '../common/validation';
import { ShippingMethodsService } from './shipping-methods.service';

type Request = { principal: Principal };

const rulesSchema = z.record(z.string().max(100), z.number().int().min(0).max(2147483647)).optional();

const createSchema = z.object({
  name: text,
  kind: z.enum(['FIXED', 'FREE_OVER', 'TABLE', 'PICKUP']),
  baseCost: z.number().int().min(0).max(2147483647),
  freeOver: z.number().int().min(0).max(2147483647).nullable().optional(),
  rules: rulesSchema,
}).strict();

const updateSchema = z.object({
  name: text.optional(),
  kind: z.enum(['FIXED', 'FREE_OVER', 'TABLE', 'PICKUP']).optional(),
  baseCost: z.number().int().min(0).max(2147483647).optional(),
  freeOver: z.number().int().min(0).max(2147483647).nullable().optional(),
  rules: rulesSchema,
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
}).strict().refine(v => Object.keys(v).length > 0);

@Controller('shipping-methods')
@UseGuards(AuthGuard)
export class ShippingMethodsController {
  constructor(private readonly methods: ShippingMethodsService) {}

  @Get() list(@Req() req: Request) {
    return this.methods.list(req.principal.shopId);
  }

  @Post() create(@Req() req: Request, @Body() body: unknown) {
    return this.methods.create(req.principal.shopId, parse(createSchema, body));
  }

  @Patch(':id') update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.methods.update(req.principal.shopId, id, parse(updateSchema, body));
  }

  @Delete(':id') remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.methods.remove(req.principal.shopId, id);
  }
}
