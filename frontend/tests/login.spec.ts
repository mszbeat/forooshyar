import { expect, test } from '@playwright/test';

/**
 * رگرسیون باگ ورود/ثبت‌نام: کلیک روی «ساخت فروشگاه» نباید فرم و کارت خوش‌آمد
 * را از هم جدا کند یا صفحه را خالی بگذارد. هر دو در هر دو عرض باید دیده شوند.
 */
test.describe('login/register toggle', () => {
  test('toggle keeps form, welcome card and submit visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'ورود به پنل فروشنده' })).toBeVisible();
    await expect(page.getByRole('button', { name: /ورود به پنل/ })).toBeVisible();

    await page.getByRole('tab', { name: 'ساخت فروشگاه' }).click();

    // فرم ثبت‌نام (نام فروشگاه + دکمه‌ی ساخت) در همان صفحه ظاهر می‌شود.
    await expect(page.getByRole('heading', { name: 'فروشگاه تازه بسازید' })).toBeVisible();
    await expect(page.getByLabel(/نام فروشگاه/)).toBeVisible();
    await expect(page.getByRole('button', { name: /ساخت فروشگاه/ }).first()).toBeVisible();

    // کارت خوش‌آمد (پنل روایت) همچنان در دید است — نه بیرون از صفحه.
    await expect(page.locator('.authx-visual')).toBeVisible();

    // همه‌ی عناصر کلیدی داخل قاب دید (viewport) هستند.
    const inViewport = await page.evaluate(() => {
      const els = [
        document.querySelector('.authx-form-card'),
        document.querySelector('.authx-visual'),
        document.querySelector('.authx-submit'),
      ];
      return els.every(el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1;
      });
    });
    expect(inViewport).toBe(true);

    // برگشت به ورود هم همان چیدمان را نگه می‌دارد.
    await page.getByRole('tab', { name: 'ورود' }).click();
    await expect(page.getByRole('heading', { name: 'ورود به پنل فروشنده' })).toBeVisible();
    await expect(page.getByRole('button', { name: /ورود به پنل/ })).toBeVisible();
  });

  test('direct /login?mode=register opens register in place', async ({ page }) => {
    await page.goto('/login?mode=register');
    await expect(page.getByRole('heading', { name: 'فروشگاه تازه بسازید' })).toBeVisible();
    await expect(page.getByLabel(/نام فروشگاه/)).toBeVisible();
    await expect(page.locator('.authx-visual')).toBeVisible();
  });

  test('register without terms shows inline error', async ({ page }) => {
    await page.goto('/login?mode=register');
    await page.getByLabel(/نام فروشگاه/).fill('فروشگاه تست');
    await page.getByRole('textbox', { name: 'ایمیل' }).fill('test@example.com');
    await page.getByLabel(/رمز عبور/).fill('password123');
    await page.locator('.authx-submit').click();
    await expect(page.getByText(/شرایط استفاده را بپذیرید/)).toBeVisible();
  });

  test('screenshot: register layout', async ({ page }) => {
    await page.goto('/login?mode=register');
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('login-register.png', { fullPage: false });
  });
});
