import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const routes=['/','/services/','/services/configuration-history/','/services/run-comparison/','/services/pilot/','/walkthrough/','/sectors/','/sectors/robotic-manipulation/','/about/','/contact/'];
for (const width of [320,768,1440]) test(`marketing routes, accessibility and layout at ${width}px`,async({page})=>{
  test.setTimeout(180000);
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const route of routes){
    await page.goto(route);
    await expect(page.getByRole('heading',{level:1})).toHaveCount(1);
    const nav=page.getByRole('navigation',{name:'Main navigation'});
    for(const name of ['Home','Services','Sectors','About']) await expect(nav.getByRole('link',{name,exact:true})).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    for(const href of await page.locator('a[href^="/"]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('href')!))])) expect((await page.request.get(href)).status()).toBe(200);
    await page.screenshot({path:`test-results/marketing-${route.replaceAll('/','-')}-${width}.png`,fullPage:true});
  }
});
test('navigation, history, motion and deep links',async({page})=>{
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link',{name:'Services',exact:true}).click();
  await expect(page).toHaveURL(/\/services\/$/);
  await page.getByRole('link',{name:/02 Run comparison/}).click();
  await expect(page).toHaveURL(/\/services\/run-comparison\/$/);
  await expect(page.getByText('6 recorded changes',{exact:true})).toBeVisible();
  await page.getByText('Inspect the example’s context and provenance').click();
  const provenanceLink=page.getByRole('link',{name:/Inspect each field and its provenance/});
  await provenanceLink.hover();
  await expect(provenanceLink).toHaveCSS('color','rgb(244, 226, 183)');
  await page.reload();
  await expect(page.getByLabel('Compare baseline run-042 with')).toHaveValue('run-043');
  await page.goBack();
  await expect(page).toHaveURL(/\/services\/$/);
  await page.goto('/');
  await page.evaluate(()=>scrollTo(0,650));
  await expect.poll(()=>page.locator('.marketing').evaluate(el=>el.style.getPropertyValue('--drift'))).not.toBe('0px');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.m-sculpture')).toHaveCSS('transform','none');
  await expect(page.locator('.reveal-pending')).toHaveCount(0);
});
test('marketing content remains accessible without JavaScript',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:3000/');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.locator('main > section')).toHaveCount(5);
  for (const section of await page.locator('main > section').all()) await expect(section).toHaveCSS('opacity','1');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'About',exact:true}).click();
  await expect(page.getByRole('link',{name:/Email the founders/})).toHaveAttribute('href',/^mailto:/);
  await context.close();
});

test('mobile motion stays still and navigation works by keyboard',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.evaluate(()=>scrollTo(0,700));
  await expect(page.locator('.m-sculpture')).toHaveCSS('transform','none');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length),{timeout:1000}).toBe(0);
  for (const [name,path] of [['Services','/services/'],['Sectors','/sectors/'],['About','/about/'],['Home','/']]) {
    const link=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name,exact:true});
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('http://127.0.0.1:3000'+path);
  }
  await expect(page.getByRole('link',{name:'Explore the working demo',exact:false})).toHaveAttribute('href','/demo/');
});
