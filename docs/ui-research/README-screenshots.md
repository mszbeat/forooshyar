# اسکرین‌شات‌ها (کامیت نشده)

اسکرین‌شات‌های خام (حدود ۲۶ مگابایت PNG) عمداً در گیت نگه‌داری نمی‌شوند تا تاریخچه‌ی مخزن باد نکند.
در محیط کاری در مسیر زیر هستند:

```
research/stripe/        desktop-full.png، desktop-fold.png، section-00..15.png،
                        mobile-fold.png، mobile-menu.png، header-top/scrolled.png، page.html
research/flowninja/     همان مجموعه + section-00..12.png + pricing.png
research/stripe-contact.png       کانتکت‌شیت همه‌ی بخش‌ها
research/flowninja-contact.png
research/demo-shots/    اسکرین‌شات دموی کپی‌شده در ۱۴۴۰ و ۳۹۰
```

بازتولید با:

```bash
node docs/ui-research/analyze.js https://stripe.com/en-bg stripe 16
node docs/ui-research/probe.js   https://stripe.com/en-bg stripe
```
