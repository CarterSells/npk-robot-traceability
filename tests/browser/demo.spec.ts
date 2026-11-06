import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('engineer selects a baseline and inspects differences and exact evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Explore the working demo/ }).click();
  await expect(page).toHaveURL(/\/demo\/$/);
  await expect(page.getByRole('heading', { name:'Robot test history' })).toBeVisible();
  await expect(page.getByLabel('Successful baseline')).toHaveValue('');
  await page.getByLabel('Successful baseline').selectOption('run-042');
  await expect(page.getByText('6 changed · 1 unknown')).toBeVisible();
  await expect(page.getByRole('heading', { name:'Working setup reference' })).toBeVisible();
  await expect(page.getByRole('region', { name:'Settings comparison' }).getByRole('cell', { name:'Unknown', exact:true })).toBeVisible();
  await page.getByText('Selected record: run-043 · exact revision & provenance', { exact:true }).click();
  const selectedRecord = page.locator('details.demo-record').filter({ has: page.locator('summary', { hasText:'Selected record: run-043' }) });
  await selectedRecord.getByText(/Hardware \/ Gripper identity/).click();
  await expect(selectedRecord.getByText(/Synthetic operator manifest · Manual hardware report/)).toBeVisible();
  await expect(page.getByText('synthetic:snap-043:hardware — Unavailable; synthetic reference only')).toBeVisible();
  await page.getByLabel('Successful baseline').selectOption('run-044');
  await expect(page.getByText('Comparison needs caution')).toBeVisible();
  await expect(page.getByText('The baseline does not precede the selected run.')).toBeVisible();
});

test('incomplete records, not-applicable model, empty robots, and selection resets', async ({ page }) => {
  await page.goto('/demo/');
  await page.getByRole('button', { name:/run-045/ }).click();
  await expect(page.getByText('Stale manual hardware confirmation at this run.', { exact:false })).toBeVisible();
  await page.getByLabel('Successful baseline').selectOption('run-042');
  await expect(page.getByText('Conditions with units: unknown; comparability is limited.')).toBeVisible();
  await page.getByRole('button', { name:/Robot 02/ }).click();
  await expect(page.getByLabel('Successful baseline')).toHaveValue('');
  await expect(page.getByText('No other successful run is available')).toBeVisible();
  await page.getByText('Selected record: run-101 · exact revision & provenance', { exact:true }).click();
  await expect(page.getByText('Model / Policy model version: Not applicable — Scripted picking without a learned model', { exact:true })).toBeVisible();
  await page.getByRole('button', { name:/Robot 03/ }).click();
  await expect(page.getByText('No runs recorded for this synthetic robot.', { exact:false })).toBeVisible();
  await expect(page.getByLabel('Successful baseline')).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`demo layout and accessibility at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height:900 });
    await page.goto('/demo/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name:'Skip to demo' })).toBeFocused();
    await page.getByLabel('Successful baseline').selectOption('run-042');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    expect(errors).toEqual([]);
    await page.screenshot({ path:`test-results/demo-${width}.png`, fullPage:true });
  });
}
