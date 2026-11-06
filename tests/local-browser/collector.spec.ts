import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve('test-results/collector-handoffs');
test.beforeAll(() => {
  mkdirSync(directory, { recursive:true });
  const python = process.env.UNIFY_PYTHON || (existsSync('.tools/python-3.13.7/python.exe') ? resolve('.tools/python-3.13.7/python.exe') : process.platform === 'win32' ? 'python' : 'python3');
  execFileSync(python, ['collector/test_collector.py', '--fixtures', directory]);
});

test('collector capture to comparison preserves history, rejects conflicts and exports', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', r => { if (r.method() !== 'GET' && !r.url().includes('__nextjs')) writes.push(r.url()); });
  await page.goto('/workspace/');
  await page.getByText('Capture from your test setup', { exact:true }).click();
  const input = page.getByLabel('Add collector capture');
  await input.setInputFiles(resolve(directory, 'first.json'));
  await expect(page.getByRole('status')).toContainText('Capture added');
  await input.setInputFiles(resolve(directory, 'second.json'));
  await expect(page.getByRole('combobox', { name:'Target run', exact:true })).toHaveValue('capture-run-2');
  await page.getByRole('combobox', { name:'Successful baseline', exact:true }).selectOption('capture-run-1');
  await expect(page.getByText('1 recorded changes', { exact:true })).toBeVisible();
  await expect(page.getByRole('region', { name:'Run comparison' }).getByText('Unknown', { exact:true })).not.toHaveCount(0);
  await input.setInputFiles(resolve(directory, 'first.json'));
  await expect(page.locator('.local-stats')).toContainText('2 runs');
  const conflict = JSON.parse(readFileSync(resolve(directory, 'first.json'), 'utf8'));
  conflict.records.snapshots[0].values.model.value = 'conflicting-version';
  await input.setInputFiles({ name:'conflict.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(conflict)) });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('conflicts');
  await expect(page.locator('.local-stats')).toContainText('2 runs');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name:'Export JSON' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported.records.snapshots).toHaveLength(2);
  expect(exported.records.runs.every((r: {snapshotRevision:number}) => r.snapshotRevision === 1)).toBe(true);
  expect(writes).toEqual([]);
});

test('collector instructions and file action fit narrow screens and keyboard access', async ({ page }) => {
  await page.goto('/workspace/');
  await page.getByText('Capture from your test setup', { exact:true }).click();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height:900 });
    await expect(page.getByLabel('Add collector capture')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Add collector capture').focus();
  await expect(page.getByLabel('Add collector capture')).toBeFocused();
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path:'test-results/collector-workspace-mobile.png', fullPage:true });
});

test('a capture without a result automatically prepares its exact test snapshot', async ({ page }) => {
  await page.goto('/workspace/');
  const capture = JSON.parse(readFileSync(resolve(directory, 'first.json'), 'utf8'));
  capture.records.runs = [];
  await page.getByText('Capture from your test setup', { exact:true }).click();
  await page.getByLabel('Add collector capture').setInputFiles({ name:'before-test.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(capture)) });
  const form = page.getByRole('form', { name:'Record a test run', exact:true });
  await expect(form).toBeVisible();
  await expect(form.getByRole('combobox', { name:'Exact snapshot revision', exact:true })).toHaveValue(`${capture.records.snapshots[0].id}:1`);
  await expect(form.getByRole('combobox', { name:'Outcome', exact:true })).toHaveValue('');
  await expect(page.locator('.local-stats')).toContainText('0 runs');
});
