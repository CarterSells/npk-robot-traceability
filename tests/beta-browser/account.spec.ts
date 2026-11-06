import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('account creation validates confirmation and shows email guidance without signing in',async({page})=>{
 let registrations=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/session')return route.fulfill({status:401,json:{error:'Sign in'}});
  if(path==='/api/signup')registrations++;
  await route.fulfill({json:path==='/api/signup'?{message:'If eligible, check your inbox.'}:{configured:true}});
 });
 await page.goto('/');await page.screenshot({path:'.cache/account-desktop.png',fullPage:true});await page.getByRole('button',{name:'New here? Create an account'}).click();
 await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-passphrase-1');
 await page.getByLabel('Confirm password').fill('synthetic-passphrase-2');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.locator('.account-card [role=alert]')).toContainText('do not match');expect(registrations).toBe(0);
 await page.getByLabel('Confirm password').fill('synthetic-passphrase-1');
 await page.getByRole('button',{name:'Show passwords'}).click();await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');
 await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('status')).toContainText('check your inbox');expect(registrations).toBe(1);
 await expect(page.getByLabel('Organization',{exact:true})).toHaveCount(0);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'.cache/account-mobile.png',fullPage:true});
});

test('recovery link is removed from URL and password setup returns to login',async({page})=>{
 let exchanged=0,updated=0;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/session')return route.fulfill({status:401,json:{error:'Sign in'}});
  if(path==='/api/auth-session'){exchanged++;expect(route.request().postDataJSON().access_token).toBe('synthetic-link-token');}
  if(path==='/api/password')updated++;
  await route.fulfill({json:{}});
 });
 await page.goto('/#access_token=synthetic-link-token&refresh_token=synthetic-refresh&type=recovery');
 await expect(page.getByRole('heading',{name:'Choose a new password'})).toBeVisible();expect(new URL(page.url()).hash).toBe('');expect(exchanged).toBe(1);
 await page.getByLabel('Password',{exact:true}).fill('synthetic-new-passphrase');await page.getByLabel('Confirm password').fill('synthetic-new-passphrase');
 await page.getByRole('button',{name:'Save password',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();expect(updated).toBe(1);
});

test('forgot password and demo are reachable without a session',async({page})=>{
 await page.route('**/api/**',async route=>{
  if(new URL(route.request().url()).pathname==='/api/session')return route.fulfill({status:401,json:{error:'Sign in'}});
  await route.fulfill({json:{message:'If eligible, check your inbox.'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Forgot password?'}).click();await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await page.getByRole('button',{name:'Send reset link'}).click();await expect(page.getByRole('status')).toContainText('check your inbox');
 await page.getByRole('link',{name:'Try the demo without signing in'}).click();await expect(page.getByRole('heading',{name:'Explore without an account'})).toBeVisible();await expect(page.getByRole('button',{name:'Load synthetic example'})).toBeVisible();
});
