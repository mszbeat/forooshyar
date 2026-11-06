import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { integer, optionalText, parse, text } from '../common/validation';
import { CatalogService } from './catalog.service';
type Request = { principal: Principal };
const product = z.object({ title: text, description: optionalText.optional(), category: optionalText.optional() }).strict();
const productUpdate = product.partial().extend({ active: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0);
const variant = z.object({ sku: text.optional(), size: optionalText.optional(), color: optionalText.optional(), price: integer, stock: integer.default(0) }).strict();
const variantUpdate = z.object({ sku: text.nullable().optional(), size: optionalText.optional(), color: optionalText.optional(), price: integer.optional() }).strict().refine(v => Object.keys(v).length > 0);
const sale = z.object({ quantity: z.number().int().min(1).max(2147483647).default(1) }).strict();
const adjustment = z.object({ delta: z.number().int().min(-2147483647).max(2147483647).refine(v => v !== 0), reason: z.enum(['restock', 'manual']) }).strict();
@Controller()
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('products') list(@Req() req: Request) { return this.catalog.list(req.principal.shopId); }
  @Post('products') create(@Req() req: Request, @Body() body: unknown) { return this.catalog.createProduct(req.principal.shopId, parse(product, body)); }
  @Get('products/:id') get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.catalog.product(req.principal.shopId, id); }
  @Patch('products/:id') update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.updateProduct(req.principal.shopId, id, parse(productUpdate, body)); }
  @Post('products/:id/variants') createVariant(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.createVariant(req.principal.shopId, req.principal.userId, id, parse(variant, body)); }
  @Patch('variants/:id') updateVariant(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.updateVariant(req.principal.shopId, id, parse(variantUpdate, body)); }
  @Post('variants/:id/sell') sell(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { return this.catalog.changeStock(req.principal.shopId, req.principal.userId, id, -parse(sale, body).quantity, 'sale'); }
  @Post('variants/:id/stock') adjust(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) { const input = parse(adjustment, body); return this.catalog.changeStock(req.principal.shopId, req.principal.userId, id, input.delta, input.reason); }
  @Get('variants/:id/movements') movements(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.catalog.movements(req.principal.shopId, id); }
}
