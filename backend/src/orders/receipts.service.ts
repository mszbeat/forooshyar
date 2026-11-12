import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';
import { AiService } from '../ai/ai.service';
import { verifyReceipt, type ExtractedReceipt } from './receipt-verify';

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** پرامپت استخراج رسید (Appendix A5) — فقط خواندن، بدون هیچ تصمیمی. */
const EXTRACTION_SYSTEM = `تو یک استخراج‌کننده‌ی رسید پرداخت بانکی ایرانی هستی. فقط اطلاعات را از تصویر بخوان و JSON برگردان؛ هیچ تصمیمی نگیر و هیچ مقداری را حدس نزن.
خروجی باید دقیقاً یک JSON با این شکل باشد (بدون هیچ متن اضافه):
{
  "readable": true,
  "amount": 145000,
  "amountCurrency": "toman",
  "destinationCardLast4": "7893",
  "destinationHolder": "نام دارنده",
  "sourceCardLast4": "1234",
  "trackingCode": "شماره پیگیری",
  "dateTime": "2026-11-12T10:30:00+03:30",
  "bank": "نام بانک"
}
قوانین:
- amount: مبلغ واریزشده به‌صورت عدد (بدون جداکننده). اگر واحد روی رسید «ریال» بود amountCurrency را "rial" و اگر «تومان» بود "toman" بگذار؛ اگر معلوم نبود "unknown".
- destinationCardLast4: چهار رقم آخر کارت مقصد (کارت فروشگاه).
- dateTime: ISO 8601 با منطقه‌ی زمانی آسیا/تهران؛ اگر فقط ساعت/تاریخ بود همان را بنویس.
- اگر رسید خوانا نیست یا فیلدی پیدا نشد، مقدارش را null بگذار و readable را false کن.
- هرگز مبلغ، شماره کارت یا کد پیگیری را از خودت نساز.`;

/**
 * رسیدهای پرداخت کارت‌به‌کارت: ذخیره‌ی تصویر، استخراج با مدل بینایی،
 * چک‌های قطعی، حکم و صندوق بررسی فروشنده.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger('Receipts');

  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
  ) {}

  private storageDir(): string {
    return process.env.RECEIPT_STORAGE_DIR ?? join(process.cwd(), 'storage', 'receipts');
  }

  /**
   * ثبت رسید برای یک سفارش در انتظار پرداخت.
   * تصویر ذخیره می‌شود، هش آن برای تشخیص تکراری بررسی می‌شود، بعد
   * استخراج + چک‌های قطعی + حکم.
   */
  async submitReceipt(shopId: string, orderId: string, image: { buffer: Buffer; mimeType: string }) {
    if (!ALLOWED_MIME.has(image.mimeType)) {
      throw new BadRequestException('فقط تصویر (JPEG/PNG/WebP) برای رسید قبول است.');
    }
    if (image.buffer.length === 0 || image.buffer.length > MAX_RECEIPT_BYTES) {
      throw new BadRequestException('حجم تصویر رسید باید بین ۱ بایت و ۵ مگابایت باشد.');
    }

    const order = await this.db.order.findFirst({
      where: { shopId, id: orderId },
      include: { shop: { select: { receiptAutoConfirm: true, receiptAutoConfirmMax: true } } },
    });
    if (!order) throw new NotFoundException('سفارش پیدا نشد.');
    if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'NEEDS_REVIEW' && order.status !== 'RECEIPT_RECEIVED') {
      throw new ConflictException('این سفارش در وضعیت دریافت رسید نیست.');
    }

    const imageHash = createHash('sha256').update(image.buffer).digest('hex');
    const duplicate = await this.db.paymentReceipt.findFirst({ where: { shopId, imageHash } });
    if (duplicate) {
      throw new ConflictException('این تصویر رسید قبلاً ثبت شده است.');
    }

    const dir = this.storageDir();
    await mkdir(dir, { recursive: true });
    const imageRef = join(dir, `${imageHash}.bin`);
    await writeFile(imageRef, image.buffer);

    const extracted = await this.extract(image.buffer, image.mimeType);

    const methods = await this.db.shopPaymentMethod.findMany({
      where: { shopId, active: true },
      select: { cardLast4: true, holderName: true },
    });
    const usedTracking = await this.db.paymentReceipt.findMany({
      where: { shopId },
      select: { extractedJson: true },
      take: 500,
    });
    const usedCodes = usedTracking
      .map((row) => (row.extractedJson as ExtractedReceipt | null)?.trackingCode)
      .filter((code): code is string => Boolean(code));

    const result = verifyReceipt(extracted, {
      expectedTotal: order.total,
      destinationLast4s: methods.map((m) => m.cardLast4),
      destinationHolders: methods.map((m) => m.holderName),
      usedTrackingCodes: usedCodes,
      orderCreatedAt: order.createdAt,
    });

    // سیاست فروشگاه: اگر تأیید خودکار خاموش باشد یا مبلغ از سقف بگذرد،
    // حکم CONFIRMED به NEEDS_REVIEW تنزل می‌کند.
    let verdict = result.verdict;
    let reason = result.reason;
    if (verdict === 'CONFIRMED') {
      if (!order.shop.receiptAutoConfirm) {
        verdict = 'NEEDS_REVIEW';
        reason = 'تأیید خودکار در تنظیمات فروشگاه خاموش است؛ فروشنده باید تأیید کند.';
      } else if (order.shop.receiptAutoConfirmMax != null && order.total > order.shop.receiptAutoConfirmMax) {
        verdict = 'NEEDS_REVIEW';
        reason = 'مبلغ سفارش از سقف تأیید خودکار بیشتر است؛ فروشنده باید تأیید کند.';
      }
    }

    const receipt = await this.db.$transaction(async (tx) => {
      const created = await tx.paymentReceipt.create({
        data: {
          shopId,
          orderId,
          imageRef,
          imageHash,
          extractedJson: extracted as unknown as Prisma.InputJsonValue,
          checksJson: result.checks as unknown as Prisma.InputJsonValue,
          verdict,
          verdictReason: reason,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: verdict === 'CONFIRMED' ? 'PAID' : verdict === 'REJECTED' ? 'AWAITING_PAYMENT' : 'NEEDS_REVIEW' },
      });
      return created;
    });

    this.audit.record({
      action: 'receipt.submitted',
      entity: 'receipt',
      entityId: receipt.id,
      shopId,
      meta: { orderId, verdict, reason, imageHash: imageHash.slice(0, 16) },
    });
    return { receipt, verdict, reason, checks: result.checks };
  }

  /** استخراج اطلاعات رسید با مدل بینایی؛ اگر مدل نباشد، ناخوانا برمی‌گرداند. */
  private async extract(buffer: Buffer, mimeType: string): Promise<ExtractedReceipt> {
    const raw = await this.ai.completeVision(
      EXTRACTION_SYSTEM,
      buffer.toString('base64'),
      mimeType,
      'اطلاعات این رسید پرداخت را استخراج کن و فقط JSON برگردان.',
    );
    if (!raw) return { readable: false };
    try {
      const parsed = JSON.parse(raw) as ExtractedReceipt;
      if (typeof parsed !== 'object' || parsed === null) return { readable: false };
      return { ...parsed, readable: parsed.readable === true };
    } catch {
      this.logger.warn('پاسخ مدل بینایی JSON معتبر نبود؛ رسید ناخوانا محسوب می‌شود.');
      return { readable: false };
    }
  }

  /** صندوق بررسی فروشنده: رسیدهایی که نیاز به بررسی دارند. */
  async reviewQueue(shopId: string) {
    return this.db.paymentReceipt.findMany({
      where: { shopId, verdict: 'NEEDS_REVIEW', reviewedAt: null },
      include: {
        order: { select: { id: true, code: true, total: true, customerName: true, customerPhone: true, status: true, createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  /** تأیید/رد دستی فروشنده. */
  async review(shopId: string, userId: string, receiptId: string, decision: 'CONFIRMED' | 'REJECTED', note = '') {
    const receipt = await this.db.paymentReceipt.findFirst({ where: { shopId, id: receiptId } });
    if (!receipt) throw new NotFoundException('رسید پیدا نشد.');
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.paymentReceipt.update({
        where: { id: receiptId },
        data: {
          verdict: decision,
          verdictReason: decision === 'CONFIRMED' ? 'تأیید دستی فروشنده.' : 'رد دستی فروشنده.',
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      await tx.order.update({
        where: { id: receipt.orderId },
        data: { status: decision === 'CONFIRMED' ? 'PAID' : 'AWAITING_PAYMENT' },
      });
      return row;
    });
    this.audit.record({
      action: 'receipt.reviewed',
      entity: 'receipt',
      entityId: receiptId,
      shopId,
      userId,
      meta: { decision, orderId: receipt.orderId },
    });
    return updated;
  }
}
