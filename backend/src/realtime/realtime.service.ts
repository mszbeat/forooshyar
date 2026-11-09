import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';

/**
 * رخدادهای زندهٔ فروشگاه.
 *
 * چرا SSE و نه WebSocket: پنل با همان پروکسی هم‌مبدأ (`/api/*`) حرف می‌زند و
 * یک اتصال WebSocket از میان پروکسی نکست به API، نیازمند ارتقای جداگانه در
 * سرور و تنظیمات اضافه روی Render است. SSE در همان HTTP معمولی کار می‌کند،
 * از میان پروکسی رد می‌شود، دوباره‌اتصال‌دهی‌اش در مرورگر ساده است و هیچ
 * کتابخانه‌ای (socket.io و…) لازم ندارد. جهت جریان هم یک‌طرفه است — سرور → پنل —
 * که دقیقاً همان چیزی است که اینجا لازم داریم.
 *
 * هر رخداد یک `streamId` دارد: کلیدهای فروشگاه (`shop:<id>`) و کلید عمومی
 * ادمین (`admin`). وقتی درخواستی می‌رسد، مشترک فقط رخدادهای کلیدهای خودش را
 * می‌گیرد؛ پس یک فروشنده هرگز رخداد فروشگاه دیگر را نمی‌بیند (همان قاعده‌ای که
 * در همه‌ی کوئری‌ها با `shopId` رعایت شده است).
 */
export type RealtimeEvent = {
  /** `chat` | `order` | `stock` | `product` | `settings` | `ping` */
  type: string;
  stream: string;
  at: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger('Realtime');
  private readonly bus = new Subject<RealtimeEvent>();
  private connections = 0;

  /** کلید جریان یک فروشگاه. */
  static shopStream(shopId: string): string {
    return `shop:${shopId}`;
  }

  /** کلید جریان پنل ادمین. */
  static readonly ADMIN_STREAM = 'admin';

  /**
   * انتشار یک رخداد.
   *
   * هرگز خطا نمی‌دهد: رخداد زنده «تزئینی» است و اگر پخش نشود، پنل با همان
   * بازخوانی دستی کار می‌کند؛ شکستنِ عملیات اصلی (ثبت سفارش، تغییر موجودی)
   * به‌خاطر یک اتصال بسته، غیرقابل‌قبول است.
   */
  emit(stream: string, type: string, data?: Record<string, unknown>): void {
    try {
      this.bus.next({ type, stream, at: new Date().toISOString(), data });
    } catch (error) {
      this.logger.warn(`انتشار رخداد ناموفق: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /** رخداد برای یک فروشگاه. */
  emitShop(shopId: string, type: string, data?: Record<string, unknown>): void {
    if (!shopId) return;
    this.emit(RealtimeService.shopStream(shopId), type, data);
  }

  /** رخداد برای پنل ادمین. */
  emitAdmin(type: string, data?: Record<string, unknown>): void {
    this.emit(RealtimeService.ADMIN_STREAM, type, data);
  }

  /** جریان یک یا چند کلید؛ فقط رخدادهای همان کلیدها عبور می‌کنند. */
  stream(streams: string[]): Observable<RealtimeEvent> {
    const allowed = new Set(streams);
    return this.bus.pipe(
      filter(event => allowed.has(event.stream)),
      map(event => event),
    );
  }

  get listening(): number {
    return this.connections;
  }

  /** شمارندهٔ اتصال‌ها (برای صفحهٔ سیستم ادمین). */
  track(delta: 1 | -1): void {
    this.connections = Math.max(0, this.connections + delta);
  }

  onModuleDestroy(): void {
    this.bus.complete();
  }
}
