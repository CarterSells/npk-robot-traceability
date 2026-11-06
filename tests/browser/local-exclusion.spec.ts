import { test, expect } from '@playwright/test';
test('local record workspace is excluded from the public static release', async ({ request }) => {
  expect((await request.get('/local/')).status()).toBe(404);
  expect((await request.get('/local/index.html')).status()).toBe(404);
  expect((await request.get('/workspace/')).status()).toBe(404);
  expect((await request.get('/workspace/index.html')).status()).toBe(404);
});
