import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

test('files populate varied component and CAD metadata in test drafts without rewriting saved tests', async ({ page }) => {
  await page.goto('/workspace/');
  const robot = page.getByRole('form', { name: 'Add a robot' });
  await robot.getByLabel('Robot ID', { exact: false }).fill('vacuum-cell');
  await robot.getByLabel('Robot name').fill('Synthetic vacuum cell');
  await robot.getByLabel('Task / cell').fill('Seal verification');
  await robot.getByRole('button', { name: 'Add robot', exact: true }).click();
  await page.getByText('Import engineer metadata · JSON / CSV', { exact: true }).click();
  const metadata = page.getByRole('group', { name: 'Engineer metadata import', exact: true });
  const upload = (revision: string, pressure?: number) => metadata.getByLabel('Engineer metadata file').setInputFiles({
    name: 'synthetic-components.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      vacuum: { ...(pressure === undefined ? {} : { pressure: { value: pressure, unit: 'kPa' } }), part: 'VC-42' },
      camera: { exposure: { value: 800, unit: 'us' } }, cad: { revision }, unapproved: 'omit-me',
    })),
  });
  await upload('drawing-A', -60);
  for (const path of ['/vacuum/pressure/value', '/vacuum/part', '/camera/exposure/value', '/cad/revision']) {
    await metadata.getByRole('checkbox', { name: path, exact: true }).check();
  }
  await metadata.getByLabel('Import author').fill('Synthetic engineer');
  await metadata.getByLabel('Metadata observed at (UTC)', { exact: false }).fill('2026-10-10T10:00:00Z');
  await metadata.getByRole('button', { name: 'Add approved snapshot' }).click();
  const form = page.getByRole('form', { name: 'Record a test run', exact: true });
  await expect(form).toBeVisible();
  const reference = form.getByRole('combobox', { name:'Exact snapshot revision', exact: true });
  const first = await reference.inputValue();
  expect(first).toMatch(/^metadata-.+:1$/);
  const preview = form.getByRole('group', { name: 'Test snapshot fields' });
  for (const value of ['-60 kPa', 'VC-42', '800 us', 'drawing-A']) await expect(preview).toContainText(value);
  await expect(preview).not.toContainText('omit-me');
  await expect(form.getByLabel('Successful picks')).toBeHidden();
  await expect(form.getByRole('combobox', { name:'Outcome', exact: true })).toHaveValue('');
  await form.getByLabel('Run ID', { exact: true }).fill('seal-pass');
  await form.getByLabel('Run time (UTC)').fill('2026-10-10T10:05:00Z');
  await form.getByRole('button', { name: 'Record run', exact: true }).click();
  await expect(page.locator('.local-stats')).toContainText('0 runs');
  await form.getByRole('combobox', { name:'Outcome', exact: true }).selectOption('success');
  await form.getByRole('button', { name: 'Record run', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Run recorded');

  await upload('drawing-B');
  await expect(metadata.getByText('Reusing Engineer metadata.', { exact: false })).toBeVisible();
  await metadata.getByRole('button', { name: 'Add approved snapshot' }).click();
  const second = await reference.inputValue();
  expect(second).not.toBe(first);
  await expect(preview).toContainText('drawing-B');
  await expect(preview).toContainText('Unknown');
  await form.getByLabel('Run ID', { exact: true }).fill('seal-fail');
  await form.getByLabel('Run time (UTC)').fill('2026-10-10T11:05:00Z');
  await expect(form.getByRole('combobox', { name:'Outcome', exact: true })).toHaveValue('');
  await form.getByRole('combobox', { name:'Outcome', exact: true }).selectOption('failure');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.screenshot({ path: 'test-results/file-to-test.png', fullPage: true });
  await form.getByRole('button', { name: 'Record run', exact: true }).click();
  await page.getByRole('combobox', { name:'Successful baseline', exact: true }).selectOption('seal-pass');
  const comparison = page.getByRole('region', { name: 'Run comparison' });
  await expect(comparison.getByRole('row').filter({ hasText: 'drawing-A' })).toContainText('drawing-B');
  await expect(comparison.getByRole('row').filter({ hasText: '-60 kPa' })).toContainText('Unknown');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const saved = await pending;
  const raw = readFileSync((await saved.path())!, 'utf8'), bundle = JSON.parse(raw);
  expect(bundle.records.runs.map((r: { snapshotId: string }) => r.snapshotId)).toEqual([first.slice(0, -2), second.slice(0, -2)]);
  expect(bundle.records.runs.every((r: { attemptedPicks?: number }) => r.attemptedPicks === undefined)).toBe(true);
  expect(raw).not.toContain('omit-me');
  expect(bundle.mappings).toHaveLength(1);
});
