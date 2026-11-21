// Typed dialog actions (CanopyDialogAction, docs/ui-primitives.md): a confirm focuses Cancel, an action raises a cancelable
// cx-dialog:action, an action with a target submits the footer form natively, and one without closes the dialog.
import { test, expect } from '@playwright/test';
import { openUi } from './ui-support.mjs';

// Mirrors CanopyDialog.Confirm with a submit target and a hidden field, plus a host-answered action.
const confirm = `<button type="button" id="ask-trigger" data-cx-open="ask" aria-haspopup="dialog" aria-expanded="false" aria-controls="ask">Restart spooler</button>
  <dialog id="ask" class="cx-dialog" data-cx-dialog data-cx-part="dialog" data-state="closed" data-cx-trigger="ask-trigger" role="alertdialog"
    aria-labelledby="ask-title" aria-describedby="ask-description" data-size="sm" data-modal="true" aria-modal="true" data-dismissible="false">
    <header class="cx-dialog-header" data-cx-part="header"><h2 data-cx-part="title" id="ask-title">Restart service</h2></header>
    <div class="cx-dialog-body" data-cx-part="body" id="ask-body"><p id="ask-description">Restart the print spooler?</p></div>
    <form class="cx-dialog-footer" data-cx-part="footer" method="post"><input type="hidden" name="token" value="t-1">
      <button type="button" class="cx-btn cx-dialog-action" data-cx-part="action" data-cx-cancel>Cancel</button>
      <button type="button" class="cx-btn cx-dialog-action" data-cx-part="action" data-cx-action="later" data-variant="primary">Later</button>
      <button type="submit" class="cx-btn cx-dialog-action" data-cx-part="action" data-cx-action="restart" data-variant="danger" data-danger data-tone="danger"
        name="action" value="restart" formaction="/restart" formmethod="post">Restart</button></form></dialog>`;
const dialog = page => page.getByRole('alertdialog', { name: 'Restart service' });

test('a confirmation focuses Cancel and its target action posts the answer with the hidden fields', async ({ page }) => {
  const posted = [];
  await page.route('http://canopyx.test/restart', route => { posted.push(route.request().postData()); return route.fulfill({ contentType: 'text/html', body: '<p>Restarted</p>' }); });
  await openUi(page, confirm);
  await page.getByRole('button', { name: 'Restart spooler' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.evaluate(() => { window.answers = []; document.addEventListener('cx-dialog:action', event => window.answers.push(event.detail.action)); });
  await Promise.all([page.waitForURL('http://canopyx.test/restart'), page.getByRole('button', { name: 'Restart', exact: true }).click()]);
  expect(posted).toEqual(['token=t-1&action=restart']);
});

test('a host that cancels the action answers itself, and an action without a target closes the dialog', async ({ page }) => {
  let posts = 0;
  await page.route('http://canopyx.test/restart', route => { posts++; return route.fulfill({ body: '' }); });
  await openUi(page, confirm);
  await page.evaluate(() => {
    window.answers = []; window.closes = [];
    const root = document.getElementById('ask');
    root.addEventListener('cx-dialog:action', event => { window.answers.push(event.detail.action); if (event.detail.action === 'restart') event.preventDefault(); });
    root.addEventListener('cx-dialog:close', event => window.closes.push(event.detail.reason));
  });
  await page.getByRole('button', { name: 'Restart spooler' }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  expect(posts).toBe(0);
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => [window.answers, window.closes])).toEqual([['restart', 'later'], ['action']]);
  await expect(page.getByRole('button', { name: 'Restart spooler' })).toBeFocused();
});
