import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuthGuard, Principal } from '../auth/auth.guard';
import { parse } from '../common/validation';
import { ReceiptsService } from './receipts.service';

type Request = { principal: Principal };

const reviewSchema = z.object({
  decision: z.enum(['CONFIRMED', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
}).strict();

@Controller('receipts')
@UseGuards(AuthGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** صندوق بررسی فروشنده. */
  @Get('review-queue')
  reviewQueue(@Req() req: Request) {
    return this.receipts.reviewQueue(req.principal.shopId);
  }

  /** تأیید/رد دستی فروشنده. */
  @Post(':id/review')
  review(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(reviewSchema, body);
    return this.receipts.review(req.principal.shopId, req.principal.userId, id, input.decision, input.note ?? '');
  }

  /**
   * ثبت رسید توسط مشتری (از بات/اینستاگرام صدا زده می‌شود).
   * احراز هویت با توکن داخلی سرویس انجام می‌شود، نه لاگین فروشنده.
   */
  @Post('orders/:orderId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 } }))
  submit(
    @Req() req: Request,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('تصویر رسید لازم است.');
    return this.receipts.submitReceipt(req.principal.shopId, orderId, {
      buffer: file.buffer,
      mimeType: file.mimetype,
    });
  }
}
