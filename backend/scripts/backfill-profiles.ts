/**
 * تکمیل نام مشتریان اینستاگرام از BoxAPI برای گفتگوهای قدیمی.
 *
 * چرا اسکریپت جدا: backfill ممکن است صدها گفتگو را در بر بگیرد و نباید در
 * مسیر webhook یا درخواست پنل انجام شود. این اسکریپت همان منطق سرویس
 * اینستاگرام را با یک Nest context صدا می‌زند تا رفتار یکی بماند.
 *
 * اجرا:
 *   node -r ts-node/register scripts/backfill-profiles.ts            (همه‌ی فروشگاه‌ها)
 *   node -r ts-node/register scripts/backfill-profiles.ts <shopId>  (یک فروشگاه)
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { InstagramService } from '../src/instagram/instagram.service';
import { PrismaService } from '../src/database/prisma.service';

async function main() {
  const shopArg = process.argv[2]?.trim();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const instagram = app.get(InstagramService);
    const db = app.get(PrismaService);
    const shops = shopArg
      ? [{ id: shopArg }]
      : await db.shop.findMany({ where: { active: true }, select: { id: true } });

    let totalChecked = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    for (const shop of shops) {
      const result = await instagram.backfillProfiles(shop.id);
      totalChecked += result.checked;
      totalUpdated += result.updated;
      totalFailed += result.failed;
      if (result.checked > 0) {
        console.log(`shop ${shop.id}: checked=${result.checked} updated=${result.updated} failed=${result.failed}`);
      }
    }
    console.log(`done: checked=${totalChecked} updated=${totalUpdated} failed=${totalFailed}`);
  } finally {
    await app.close();
  }
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
