import {test,expect} from '@playwright/test';
import {openExample,row} from './support.mjs';

test('host example accepts refreshed edits and moves while rejected changes preserve its data',async({page})=>{
  await openExample(page,'interactions.html');
  await row(page,'atlas').locator('.cx-exp').click();
  await row(page,'task-0').focus();await page.keyboard.press('Alt+Enter');
  await page.getByRole('textbox',{name:'Edit Project / task'}).fill('Updated task');
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(row(page,'task-0')).toContainText('Updated task');
  await page.getByRole('checkbox',{name:'Decline changes'}).check();
  await row(page,'task-0').focus();await page.keyboard.press('Alt+Enter');
  await page.getByRole('textbox',{name:'Edit Project / task'}).fill('Rejected task');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('#action-status')).toHaveText('Declined by the host.');await expect(row(page,'task-0')).toContainText('Updated task');
  await page.keyboard.press('Escape');await page.getByRole('checkbox',{name:'Decline changes'}).uncheck();
  await row(page,'task-0').focus();await page.keyboard.press('Control+Shift+x');await row(page,'beacon').focus();await page.keyboard.press('Control+Shift+v');
  await expect(page.locator('#action-status')).toHaveText('Accepted by the host.');
  await row(page,'beacon').locator('.cx-exp').click();await expect(row(page,'task-0')).toHaveAttribute('aria-level','2');
  expect(await page.evaluate(()=>{const rows=Array.from(document.querySelectorAll('.cx-row[data-cx-id]'));return rows.findIndex(r=>r.dataset.cxId==='beacon')<rows.findIndex(r=>r.dataset.cxId==='task-0')})).toBe(true);
});
