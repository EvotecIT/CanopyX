import { test, expect } from '@playwright/test';
import { formattingPage } from './formatting-support.mjs';

function view(reporting, rules) {
  return { protocol: 'canopyx/2', type: 'grid', id: 'snapshot-format', label: 'Resource checks', source: { kind: 'inline' },
    pageSize: 10, selection: 'none', ...(reporting ? { reporting: {} } : {}), formatRules: rules,
    columns: [{ id: 'name', title: 'Name', kind: 'text' }, { id: 'amount', title: 'Amount', kind: 'number' }, { id: 'when', title: 'Checked', kind: 'datetime' }],
    rows: [{ id: 'one', cells: { name: 'First', amount: 12, when: '2026-10-15T11:00:00Z' } }] };
}
async function open(page, definition, script = '') {
  await page.route('http://canopyx.test/export-format-snapshot', route => route.fulfill({ contentType: 'text/html', body: formattingPage(definition, { script }) }));
  await page.goto('http://canopyx.test/export-format-snapshot');
  await page.evaluate(async () => { window.snapshotGrid = document.querySelector('[data-canopyx-host]').canopyx; await snapshotGrid.ready; });
}

for (const reporting of [false, true]) {
  test(`export captures keep their row and cell rules after the view changes (${reporting ? 'reporting' : 'grid'})`, async ({ page }) => {
    const rules = [{ id: 'row', target: 'row', style: { tone: 'warning' } }, { id: 'cell', column: 'amount', style: { tone: 'info' } }];
    await open(page, view(reporting, rules));
    const result = await page.evaluate(async () => {
      const capture = snapshotGrid.prepareExport({ scope: 'all' }), read = async () => { const rows = []; for await (const row of capture.rows()) rows.push(row); return rows; };
      const before = await read();
      await snapshotGrid.setFormatRules([{ id: 'row', target: 'row', style: { tone: 'danger' } }, { id: 'cell', column: 'amount', style: { tone: 'success' } }]);
      return { before, after: await read(), request: capture.request };
    });
    expect(result.before[0].format.tone).toBe('warning'); expect(result.before[0].cells.amount.format.tone).toBe('info');
    expect(result.after).toEqual(result.before);
    if (reporting) expect(result.request.formatRules).toEqual(rules);
  });

  test(`relative export rules use the captured instant (${reporting ? 'reporting' : 'grid'})`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-16T10:00:00Z') });
    await open(page, view(reporting, [{ id: 'age', column: 'when', when: { operator: 'and', filters: [{ column: 'when', operator: 'olderThan', values: [1] }] }, style: { tone: 'danger' } }]));
    await page.evaluate(() => { window.capturedFormat = snapshotGrid.prepareExport({ scope: 'all' }); });
    await page.clock.fastForward(2 * 86400000);
    const result = await page.evaluate(async () => {
      const old = [], fresh = [];
      for await (const row of capturedFormat.rows()) old.push(row);
      for await (const row of snapshotGrid.prepareExport({ scope: 'all' }).rows()) fresh.push(row);
      return { old, fresh };
    });
    expect(result.old[0].cells.when.format).toBeUndefined(); expect(result.fresh[0].cells.when.format.tone).toBe('danger');
  });
}

test('automatic export bar bounds stay captured when the hosted viewport changes', async ({ page }) => {
  const definition = view(true, [{ id: 'amount', column: 'amount', style: { bar: { tone: 'info' } } }]);
  definition.source = { kind: 'host' }; delete definition.rows;
  await open(page, definition, `CanopyX.configure('snapshot-format',{source:{query(query){
    return {protocol:'canopyx/2',type:'gridPage',view:query.view,revision:'fixed',offset:query.offset,total:100,matched:100,
      items:Array.from({length:Math.min(query.limit,100-query.offset)},(_,index)=>({id:'r'+(query.offset+index),cells:{name:'Resource '+(query.offset+index),amount:query.offset+index,when:null}}))};
  }}});`);
  const result = await page.evaluate(async () => {
    const capture = snapshotGrid.prepareExport({ scope: 'all' }), read = async () => { const rows = []; for await (const row of capture.rows()) rows.push(row); return rows; };
    const before = await read(); await snapshotGrid.setQuery({ offset: 90 });
    return { before, after: await read() };
  });
  expect(result.before).toHaveLength(100); expect(result.after).toEqual(result.before);
});

test('all-matching selection exports retain formatting through the filtered enumeration', async ({ page }) => {
  const definition = view(true, [{ id: 'cell', column: 'amount', style: { tone: 'info' } }]);
  definition.selection = 'multiple'; definition.reporting.selectionControls = true;
  definition.rows.push({ id: 'two', cells: { name: 'Second', amount: 20, when: null } });
  await open(page, definition);
  const result = await page.evaluate(async () => {
    snapshotGrid.selectAllMatching(); snapshotGrid.setRowSelected('two', false);
    const capture = snapshotGrid.prepareExport({ scope: 'selected' });
    await snapshotGrid.setFormatRules([{ id: 'cell', column: 'amount', style: { tone: 'danger' } }]);
    const rows = []; for await (const row of capture.rows()) rows.push(row);
    return { request: capture.request, rows };
  });
  expect(result.request.querySelection.kind).toBe('query'); expect(result.rows).toHaveLength(1);
  expect(result.rows[0].id).toBe('one'); expect(result.rows[0].cells.amount.format.tone).toBe('info');
});
