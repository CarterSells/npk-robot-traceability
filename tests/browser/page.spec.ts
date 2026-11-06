import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [320, 390, 768, 1440]) {
  test(`outreach page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what changed.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('form')).toHaveCount(0);
    for (const href of await page.locator('a[href^="#"]').evaluateAll(links => links.map(a => a.getAttribute('href')!))) {
      await expect(page.locator(href)).toHaveCount(1);
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/page-${width}.png`, fullPage:true });
  });
}
test('metadata, keyboard entry, and preview contact are honest', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Tavrik/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ROS 2/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name:'Skip to content' })).toBeFocused();
  await page.goto('/contact/');
  const contact = 'mailto:cartercness4@gmail.com,2thomaskelley@gmail.com';
  for (const link of await page.getByRole('link', { name:'Discuss a recent regression' }).all()) await expect(link).toHaveAttribute('href', contact);
  for (const email of ['cartercness4@gmail.com', '2thomaskelley@gmail.com']) await expect(page.getByRole('link', { name:email, exact:true })).toHaveAttribute('href', `mailto:${email}`);
  await expect(page.getByText('Contact is not configured yet.')).toHaveCount(0);
  expect((await page.request.get('/build.md')).status()).toBe(404);
  expect((await page.request.get('/.env.local')).status()).toBe(404);
});
