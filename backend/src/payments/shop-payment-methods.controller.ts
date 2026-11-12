import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse, text } from '../common/validation';
import { ShopPaymentMethodsService } from './shop-payment-methods.service';

type Request = { principal: Principal };

const createSchema = z.object({
  holderName: text,
  cardNumber: z.string().trim().min(16).max(19),
  bankName: z.string().trim().max(100).optional(),
  sheba: z.string().trim().max(26).optional(),
  instruction: z.string().trim().max(500).optional(),
}).strict();

const updateSchema = z.object({
  holderName: text.optional(),
  cardNumber: z.string().trim().min(16).max(19).optional(),
  bankName: z.string().trim().max(100).optional(),
  sheba: z.string().trim().max(26).optional(),
  instruction: z.string().trim().max(500).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
}).strict().refine(v => Object.keys(v).length > 0);

const policySchema = z.object({
  receiptAutoConfirm: z.boolean().optional(),
  receiptAutoConfirmMax: z.number().int().min(0).max(2147483647).nullable().optional(),
  paymentWaitHours: z.number().int().min(1).max(168).optional(),
}).strict().refine(v => Object.keys(v).length > 0);

@Controller('payment-methods')
@UseGuards(AuthGuard)
export class ShopPaymentMethodsController {
  constructor(private readonly methods: ShopPaymentMethodsService) {}

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

  @Get('receipt-policy') receiptPolicy(@Req() req: Request) {
    return this.methods.receiptPolicy(req.principal.shopId);
  }

  @Patch('receipt-policy') updateReceiptPolicy(@Req() req: Request, @Body() body: unknown) {
    return this.methods.updateReceiptPolicy(req.principal.shopId, parse(policySchema, body));
  }
}
