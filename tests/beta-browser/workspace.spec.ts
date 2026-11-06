import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {demoRecords} from '../../lib/demo/fixtures';
import {emptyBundle} from '../../lib/local/records';
import {appendInvestigation} from '../../lib/local/records';
const org='00000000-0000-4000-8000-000000000001';
test('organization investigation saves, reloads and remains read-only for a viewer (mocked)',async({page})=>{
 let bundle=appendInvestigation({format:'unify-local',version:1,synthetic:true,records:structuredClone(demoRecords),corrections:[]},{id:'20000000-0000-4000-8000-000000000001',revision:1,runId:'run-043',baselineId:'run-042',state:'investigating',author:'Synthetic reviewer',recordedAt:'2026-10-15T12:00:00Z',note:'Inspect evidence.',evidenceNote:'',retestId:''});let version=1;let role='member';
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let data:unknown={};
  if(p==='/api/session')data={user:{email:'synthetic@example.invalid'},memberships:[{org_id:org,role,organizations:{name:'Synthetic team'}}]};
  else if(p.endsWith('/workspace'))data={bundle,version,role};
  else if(p.endsWith('/save')){bundle=route.request().postDataJSON().bundle;version++;data={version};}
  await route.fulfill({json:data});
 });
 await page.goto('/');await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);
 await page.getByRole('combobox',{name:'Target run',exact:true}).selectOption('run-043');
 const panel=page.getByRole('region',{name:'Investigation',exact:true});await panel.getByLabel('Investigation history').selectOption(bundle.investigations![0].id);
 const form=panel.getByRole('form',{name:'Record investigation'});await form.getByLabel('Investigation state').selectOption('unresolved');await form.getByLabel('Investigation note',{exact:true}).fill('Evidence remains incomplete.');await form.getByRole('button',{name:'Append investigation entry'}).click();
 await page.getByRole('button',{name:'Save to organization',exact:true}).click();await expect(page.getByText('Organization records loaded',{exact:true})).toBeVisible();expect(bundle.investigations).toHaveLength(2);
 role='viewer';await page.reload();await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);await page.getByRole('combobox',{name:'Target run',exact:true}).selectOption('run-043');await panel.getByLabel('Investigation history').selectOption(bundle.investigations![0].id);
 await expect(panel.getByText('Revision 2 · unresolved',{exact:true})).toBeVisible();await expect(panel.getByRole('form',{name:'Record investigation'})).toBeHidden();await expect(panel.getByRole('button',{name:'Export investigation report'})).toBeEnabled();
});
test('unconfigured server rejects API access and explains setup',async({page,request})=>{
 expect((await request.get('/api/status')).status()).toBe(503);
 expect((await request.get(`/api/org/${org}/workspace`)).status()).toBe(503);
 await page.goto('/');await expect(page.locator('.beta-error')).toContainText('not configured');await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeDisabled();
});
test('sign in, append draft, save, reload and sign out with mocked service',async({page})=>{
 let signedIn=false,version=0,bundle=emptyBundle();
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let data:unknown={};let status=200;
  if(p==='/api/login')signedIn=true;
  else if(p==='/api/session'){if(!signedIn){status=401;data={error:'Sign in'};}else data={user:{email:'synthetic@example.invalid'},memberships:[{org_id:org,role:'member',organizations:{name:'Synthetic team'}}]};}
  else if(p.endsWith('/workspace'))data={bundle,version,role:'member',updated_at:'2026-10-15T12:00:00Z'};
  else if(p.endsWith('/save')){const body=route.request().postDataJSON();bundle=body.bundle;version++;data={version,duplicate:false};}
  else if(p==='/api/logout')signedIn=false;
  await route.fulfill({status,json:data});
 });
 await page.goto('/');await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);
 await expect(page.getByText(/No successful save yet/)).toBeVisible();
 await page.getByLabel('Robot ID').fill('synthetic-arm');await page.getByLabel('Robot name',{exact:true}).fill('Synthetic arm');await page.getByLabel('Task / cell',{exact:true}).fill('Synthetic task');
 await page.getByRole('form',{name:'Add a robot',exact:true}).getByRole('button',{name:'Add robot',exact:true}).click();
 await expect(page.getByText('Unsaved organization draft')).toBeVisible();
 await page.getByRole('button',{name:'Save to organization',exact:true}).click();await expect(page.getByText('Organization records loaded',{exact:true})).toBeVisible();expect(bundle.records.robots[0].id).toBe('synthetic-arm');
 await expect(page.getByText(/Last successful organization save/)).toBeVisible();
 await expect(page.locator('time')).toHaveAttribute('datetime','2026-10-15T12:00:00Z');
 await page.reload();await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);await expect(page.getByRole('button',{name:/Synthetic arm/})).toBeVisible();
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);await expect(page.getByRole('button',{name:/Synthetic arm/})).toBeVisible();
});
test('viewer compares exact revisions with accessible responsive layout',async({page})=>{
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let data:unknown={};
  if(p==='/api/session')data={user:{email:'viewer@example.invalid'},memberships:[{org_id:org,role:'viewer',organizations:{name:'Synthetic team'}}]};
  else if(p.endsWith('/workspace'))data={bundle:{format:'unify-local',version:1,synthetic:true,records:demoRecords,corrections:[]},version:1,role:'viewer'};
  await route.fulfill({json:data});
 });
 await page.goto('/');await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);
 await page.getByRole('combobox',{name:'Target run',exact:true}).selectOption('run-043');await page.getByRole('combobox',{name:'Successful baseline',exact:true}).selectOption('run-042');
 await expect(page.getByText('6 recorded changes',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Save to organization',exact:true})).toBeDisabled();await expect(page.getByLabel('Robot ID',{exact:true})).toBeHidden();
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:960});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/beta-browser/viewer-${width}.png`,fullPage:true});
 }
});
test('failed save retains draft and retry identity',async({page})=>{
 const keys:string[]=[];
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let data:unknown={};let status=200;
  if(p==='/api/session')data={user:{email:'member@example.invalid'},memberships:[{org_id:org,role:'member',organizations:{name:'Synthetic team'}}]};
  else if(p.endsWith('/workspace'))data={bundle:emptyBundle(),version:0,role:'member'};
  else if(p.endsWith('/save')){keys.push(route.request().postDataJSON().request_id);status=409;data={error:'Conflicting save. Export your draft, reload the workspace, then merge your changes.'};}
  await route.fulfill({status,json:data});
 });
 await page.goto('/');await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);
 await page.getByLabel('Robot ID').fill('synthetic-arm');await page.getByLabel('Robot name',{exact:true}).fill('Synthetic arm');await page.getByLabel('Task / cell',{exact:true}).fill('Synthetic task');await page.getByRole('form',{name:'Add a robot',exact:true}).getByRole('button',{name:'Add robot',exact:true}).click();
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Save to organization',exact:true}).click();await expect(page.locator('.local-error')).toContainText('Conflicting save');}
 expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);await expect(page.getByRole('button',{name:/Synthetic arm/})).toBeVisible();await expect(page.getByText('Unsaved organization draft')).toBeVisible();
});
test('owner can update another member without losing an unsaved draft',async({page})=>{
 const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';let role='member';
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;let data:unknown={};
  if(p==='/api/session')data={user:{id:owner,email:'owner@example.invalid'},memberships:[{org_id:org,role:'owner',organizations:{name:'Synthetic team'}}]};
  else if(p.endsWith('/workspace'))data={bundle:emptyBundle(),version:0,role:'owner'};
  else if(p.endsWith('/members'))data=[{user_id:other,role}];
  else if(p.endsWith('/access'))data={invitations:[],credentials:[]};
  else if(p.endsWith('/member'))role=route.request().postDataJSON().role;
  await route.fulfill({json:data});
 });
 await page.goto('/');await page.getByRole('combobox',{name:'Organization',exact:true}).selectOption(org);
 await page.getByLabel('Robot ID').fill('synthetic-draft');await page.getByLabel('Robot name',{exact:true}).fill('Unsaved arm');await page.getByLabel('Task / cell',{exact:true}).fill('Synthetic task');await page.getByRole('form',{name:'Add a robot',exact:true}).getByRole('button',{name:'Add robot',exact:true}).click();
 await page.getByText('Manage team and collector access',{exact:true}).click();await page.getByRole('combobox',{name:other,exact:true}).selectOption('viewer');await page.getByRole('button',{name:'Update member',exact:true}).click();
 await expect(page.getByRole('combobox',{name:other,exact:true})).toHaveValue('viewer');await expect(page.getByText('Unsaved organization draft')).toBeVisible();await expect(page.getByRole('button',{name:/Unsaved arm/})).toBeVisible();
});
