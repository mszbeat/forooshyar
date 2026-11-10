import { Controller, Get, MessageEvent, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable, interval, map, merge } from 'rxjs';
import type { Principal } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { RealtimeService, type RealtimeEvent } from './realtime.service';

/**
 * `GET /events` — جریان رخدادهای فروشگاه فروشنده با Server-Sent Events.
 *
 * نکات پایداری:
 *  - هر ۲۵ ثانیه یک `ping` می‌رود. پروکسی‌ها و Render اتصال بی‌صدا را بعد از
 *    حدود ۳۰–۶۰ ثانیه می‌بندند؛ ping هم اتصال را زنده نگه می‌دارد و هم به پنل
 *    می‌گوید «خط باز است» تا دوباره وصل نشود.
 *  - وقتی کاربر صفحه را ببندد، RxJS آبونمان را می‌بندد و شمارندهٔ اتصال‌ها
 *    برمی‌گردد؛ پس نشتی اتصال نداریم.
 */
@Controller()
export class EventsController {
  constructor(private readonly realtime: RealtimeService) {}

  @Get('events')
  @UseGuards(AuthGuard)
  @Sse()
  events(@Req() request: { principal: Principal }): Observable<MessageEvent> {
    const streamId = RealtimeService.shopStream(request.principal.shopId);

    const events$ = this.realtime.stream([streamId]).pipe(
      map((event: RealtimeEvent) => ({ type: 'message', data: event }) as MessageEvent),
    );

    const ping$ = interval(25000).pipe(
      map(() => ({ type: 'ping', data: { at: new Date().toISOString() } }) as MessageEvent),
    );

    return new Observable<MessageEvent>(subscriber => {
      this.realtime.track(1);
      const subscription = merge(events$, ping$).subscribe(subscriber);
      return () => {
        this.realtime.track(-1);
        subscription.unsubscribe();
      };
    });
  }

  /**
   * `GET /admin/events` — جریان رخدادهای پلتفرم برای اتاق کنترل.
   *
   * چرا جدا از جریان فروشنده: توکن ادمین `shopId` ندارد و نباید داده‌ی یک
   * فروشگاه را ببیند؛ این جریان فقط شمارنده‌ها و رخدادهای عمومی پلتفرم را
   * می‌فرستد (سفارش تازه، پیام تازه، تغییر تنظیمات).
   */
  @Get('admin/events')
  @UseGuards(AdminGuard)
  @Sse()
  adminEvents(): Observable<MessageEvent> {
    const events$ = this.realtime.stream([RealtimeService.ADMIN_STREAM]).pipe(
      map((event: RealtimeEvent) => ({ type: 'message', data: event }) as MessageEvent),
    );
    const ping$ = interval(25000).pipe(
      map(() => ({ type: 'ping', data: { at: new Date().toISOString() } }) as MessageEvent),
    );
    return merge(events$, ping$);
  }
}
