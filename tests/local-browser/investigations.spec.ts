import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
test('investigate, confirm with evidence, export and restore exact history',async({page})=>{
 await page.goto('/workspace/');await page.getByRole('button',{name:'Load synthetic example'}).click();
 await page.getByRole('combobox',{name:'Target run',exact:true}).selectOption('run-043');
 const panel=page.getByRole('region',{name:'Investigation',exact:true});
 await panel.getByRole('button',{name:'Use suggested baseline'}).click();
 const form=panel.getByRole('form',{name:'Record investigation'});
 await form.getByLabel('Investigation author').fill('Synthetic reviewer');await form.getByLabel('Investigation note',{exact:true}).fill('Inspect calibration provenance.');
 await form.getByRole('button',{name:'Append investigation entry'}).click();
 await expect(panel.getByText('Revision 1 · investigating',{exact:true})).toBeVisible();
 await form.getByLabel('Investigation state').selectOption('confirmed-by-engineer');await form.getByLabel('Investigation note',{exact:true}).fill('Reviewed the reported evidence.');
 await form.getByRole('button',{name:'Append investigation entry'}).click();await expect(form.getByRole('alert')).toContainText('confirmation requires');
 await form.getByLabel('Resolution evidence note').fill('Synthetic retest worksheet reviewed; this is an invented example.');
 await form.getByRole('button',{name:'Append investigation entry'}).click();await expect(panel.getByText('Revision 2 · confirmed-by-engineer',{exact:true})).toBeVisible();
 const reportDownload=page.waitForEvent('download');await panel.getByRole('button',{name:'Export investigation report'}).click();const report=JSON.parse(await readFile((await (await reportDownload).path())!,'utf8'));
 expect(report.history).toHaveLength(2);expect(report.evidence[1].snapshot.revision).toBe(1);expect(report.synthetic).toBe(true);
 const bundleDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();const raw=await readFile((await (await bundleDownload).path())!,'utf8');
 await page.reload();await page.getByLabel('Import JSON').setInputFiles({name:'synthetic-investigation.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 await page.getByRole('combobox',{name:'Target run',exact:true}).selectOption('run-043');await panel.getByLabel('Investigation history').selectOption(report.investigation.id);
 await expect(panel.getByText('Revision 2 · confirmed-by-engineer',{exact:true})).toBeVisible();
 for(const width of [320,1440]) {await page.setViewportSize({width,height:960});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await page.screenshot({path:`test-results/investigation-${width}.png`,fullPage:true});}
});
