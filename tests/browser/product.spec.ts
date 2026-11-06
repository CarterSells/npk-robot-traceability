import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Home is explicit on every screen and returns to the landing page', async ({ page }) => {
  for (const path of ['/', '/demo/', '/compatibility/', '/security/']) {
    await page.goto(path);
    const home = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home', exact: true });
    await expect(home).toBeVisible();
    await home.click();
    await expect(page).toHaveURL('http://127.0.0.1:3000/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Know what changed.');
  }
});

test('homepage exploration filters real results and resets evidence with scenarios', async ({ page }) => {
  await page.goto('/services/configuration-history/');
  await page.getByRole('button', { name: 'Policy + data', exact: true }).click();
  await expect(page.getByText('Follow the recorded policy version', { exact: false })).toBeVisible();
  await page.goto('/services/run-comparison/');
  await page.getByRole('button', { name: 'Changes only', exact: true }).click();
  await expect(page.getByText('Showing 6 of 10 fields.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grip force (N)', exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gripper firmware', exact: false }).click();
  const evidence = page.getByRole('region', { name: 'Field evidence', exact: true });
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText('gripper-fw-1.8');
  await expect(evidence).toContainText('gripper-fw-1.9');
  await expect(evidence).toContainText('Unavailable');
  await expect(evidence).toBeFocused();
  await page.getByRole('button', { name: /Back to selected field/ }).click();
  await expect(page.getByRole('button', { name: 'Gripper firmware', exact: false })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Missing evidence/ }).click();
  await expect(evidence).toBeHidden();
  await expect(page.getByLabel('Compare baseline run-042 with')).toHaveValue('run-045');
  await expect(page.getByRole('button', { name: 'All fields', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Unknown only', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Changed', exact: true })).toHaveCount(0);
  await expect(page.getByText('Comparability is limited', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Reset example/ }).click();
  await expect(page.getByLabel('Compare baseline run-042 with')).toHaveValue('run-043');
  await expect(page.getByText('Showing 10 of 10 fields.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Different procedure/ }).click();
  await expect(page.getByText('Comparability is limited', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Gripper identity / revision', exact: false }).focus();
  await page.keyboard.press('Enter');
  await expect(evidence).toContainText('Demo operator');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
test('homepage runs the comparison and presents an honest pilot offer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a.m-button')).toHaveCount(1);
  await page.goto('/services/pilot/');
  await expect(page.getByText('USD 1,000', { exact:false })).toBeVisible();
  await page.goto('/services/run-comparison/');
  await expect(page.getByText('6 recorded changes', { exact:true })).toBeVisible();
  for (const value of ['gripper-fw-1.8','gripper-fw-1.9','teleop-block-A-v12','teleop-block-A-v13']) await expect(page.getByRole('cell', { name:value, exact:true })).toBeVisible();
  await page.getByLabel('Compare baseline run-042 with').selectOption('run-045');
  await expect(page.getByText('Comparability is limited', { exact:true })).toBeVisible();
  await expect(page.getByText(/Stale manual hardware confirmation: more than 24 hours/)).toBeVisible();
  await expect(page.getByRole('cell', { name:'Unknown', exact:true }).first()).toBeVisible();
});
test('compatibility states change without interpreting no-match as safe', async ({ page }) => {
  await page.goto('/compatibility/');
  await expect(page.getByText('Synthetic known-bad match', { exact:true })).toBeVisible();
  await page.getByLabel('Run configuration').selectOption('run-042');
  await expect(page.getByText('Not assessed', { exact:true })).toBeVisible();
  await expect(page.getByText(/Absence of a match does not mean compatible/)).toBeVisible();
  await page.getByLabel('Run configuration').selectOption('run-045');
  await expect(page.getByText('Insufficient information', { exact:true })).toBeVisible();
});
test('public links resolve and security claims stay factual', async ({ page }) => {
  for (const path of ['/', '/demo/', '/compatibility/', '/security/']) {
    await page.goto(path);
    for (const href of await page.locator('a[href^="/"]').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href')!))])) expect((await page.request.get(href)).status()).toBe(200);
    await expect(page.locator('img:not([alt])')).toHaveCount(0);
  }
  await expect(page.getByText('No Tavrik certifications or independent security audits are claimed.', { exact:true })).toBeVisible();
});
for (const path of ['/compatibility/', '/security/']) {
  for (const width of [320, 1440]) test(`${path} accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 });
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path:`test-results/${path.replaceAll('/','')}-${width}.png`, fullPage:true });
  });
}
