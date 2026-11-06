import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/beta-browser',outputDir:'test-results/beta-browser',timeout:60000,workers:1,
 use:{baseURL:'http://127.0.0.1:3002',headless:true},
 webServer:{command:'node node_modules/next/dist/bin/next start beta --hostname 127.0.0.1 --port 3002',url:'http://127.0.0.1:3002',reuseExistingServer:false,timeout:120000,env:{BETA_ENABLED:'false'}},
});
