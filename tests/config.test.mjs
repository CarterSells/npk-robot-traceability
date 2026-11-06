import test from 'node:test';
import assert from 'node:assert/strict';
import { readSiteConfig } from '../lib/site-config.mjs';
test('missing configuration stays a non-indexable preview', () => {
  assert.equal(readSiteConfig({}).launchReady, false);
  assert.equal(readSiteConfig({ CONTACT_URL:'mailto:founder@example.com' }).launchReady, false);
});
test('supported contact and canonical origin', () => {
  assert.deepEqual(readSiteConfig({ CONTACT_URL:'mailto:founder@example.com', SITE_URL:'https://example.com/' }), { contactUrl:'mailto:founder@example.com', siteUrl:'https://example.com', launchReady:true });
  assert.equal(readSiteConfig({ CONTACT_URL:'https://example.com/schedule' }).contactUrl, 'https://example.com/schedule');
});
test('reject unsafe and malformed destinations', () => {
  for (const contact of ['javascript:alert(1)', 'http://example.com', 'mailto:a@example.com?bcc=b@example.com', 'https://user:pass@example.com', 'mailto:invalid']) assert.throws(() => readSiteConfig({ CONTACT_URL:contact }));
  for (const site of ['http://example.com', 'https://localhost', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com/?x=1']) assert.throws(() => readSiteConfig({ SITE_URL:site }));
});
test('multiple founder recipients preserve both addresses and reject malformed lists', () => {
  const contact = 'mailto:cartercness4@gmail.com,2thomaskelley@gmail.com';
  assert.equal(readSiteConfig({ CONTACT_URL:contact }).contactUrl, contact);
  for (const value of ['mailto:a@example.com,', 'mailto:a@example.com,,b@example.com', 'mailto:a@example.com,invalid', 'mailto:a@example.com%0D%0ABcc:b@example.com']) assert.throws(() => readSiteConfig({ CONTACT_URL:value }));
});
