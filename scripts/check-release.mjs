import nextEnv from '@next/env';
import { readSiteConfig } from '../lib/site-config.mjs';
nextEnv.loadEnvConfig(process.cwd());
const config = readSiteConfig();
if (!config.launchReady) {
  const missing = [!config.contactUrl && 'CONTACT_URL', !config.siteUrl && 'SITE_URL'].filter(Boolean);
  console.error(`Publication blocked: configure ${missing.join(' and ')}, then rebuild and verify the exported page.`);
  process.exitCode = 1;
} else console.log('Configuration present. Ownership, live CTA, domain/TLS and deployment still require verification.');
