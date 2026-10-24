import { test, expect } from '@playwright/test';
import { runtimeAssets, nextFrames } from './support.mjs';

for (const reporting of [false, true]) for (const phase of ['initial', 'observed', 'same-frame', 'deferred'])
  for (const action of (phase === 'deferred' ? ['focus'] : ['focus', 'move', 'return', 'blur', 'destroy'])) {
    test(`hidden-panel explicit focus (${reporting ? 'reporting' : 'ordinary'}, ${phase}, ${action})`, async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const view = { protocol: 'canopyx/2', type: 'grid', id: 'hidden-focus', label: 'Records', pageSize: 100,
        selection: 'single', source: { kind: 'inline' }, columns: [{ id: 'name', title: 'Name', kind: 'text' }],
        rows: [{ id: 'a', cells: { name: 'Alpha' } }], ...(reporting ? { reporting: {} } : {}) };
      const { script, style } = runtimeAssets(reporting ? 'reporting' : 'grid');
      const html = `<!doctype html><style>${style}#host{width:600px;height:320px}</style><script>${script}</script>
        <button id="outside">Outside</button><button id="later">Later</button>
        <section id="panel" ${phase === 'initial' ? 'hidden' : ''}><div id="host"></div></section><script>
        const api=CanopyX.createDataGrid(document.querySelector('#host'),{view:${JSON.stringify(view)}});
        const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        window.requested=(async()=>{await api.ready;
          if('${phase}'!=='initial'){await frames();document.querySelector('#panel').hidden=true;
            if('${phase}'==='observed')await frames();}
          document.querySelector('#outside').focus();window.hiddenWidth=document.querySelector('.cx-grid').clientWidth;
          api.focus();
          if('${action}'==='move'||'${action}'==='return')document.querySelector('#later').focus();
          if('${action}'==='return')document.querySelector('#outside').focus();
          if('${action}'==='blur'){document.querySelector('#outside').blur();document.querySelector('#outside').focus();}
          if('${action}'==='destroy')api.destroy();
          if('${phase}'==='deferred')await frames();
          document.querySelector('#panel').hidden=false;
        })();</script>`;
      await page.route('http://canopyx.test/hidden-focus', route => route.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://canopyx.test/hidden-focus'); await page.evaluate(() => window.requested);
      expect(await page.evaluate(() => window.hiddenWidth)).toBe(0);
      await nextFrames(page); await nextFrames(page);
      if (action === 'focus') await expect(page.locator('.cx-row')).toBeFocused();
      else await expect(page.locator(action === 'move' ? '#later' : '#outside')).toBeFocused();
      if (action === 'destroy') await expect(page.locator('.cx-grid')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

for (const reporting of [false, true]) for (const operation of ['reload', 'state', 'filter', 'empty', 'reload-move', 'reload-destroy']) {
  test(`hidden-panel query replacement (${reporting ? 'reporting' : 'ordinary'}, ${operation})`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const view = { protocol: 'canopyx/2', type: 'grid', id: 'hidden-query', label: 'Records', pageSize: 100,
      selection: 'single', source: { kind: 'inline' }, columns: [{ id: 'name', title: 'Name', kind: 'text', sortable: true }],
      rows: [{ id: 'a', cells: { name: 'Alpha' } }, { id: 'b', cells: { name: 'Bravo' } }], ...(reporting ? { reporting: {} } : {}) };
    const { script, style } = runtimeAssets(reporting ? 'reporting' : 'grid');
    const html = `<!doctype html><style>${style}#host{width:600px;height:320px}</style><script>${script}</script>
      <button id="outside">Outside</button><button id="later">Later</button>
      <section id="panel" hidden><div id="host"></div></section><script>
      const api=CanopyX.createDataGrid(document.querySelector('#host'),{view:${JSON.stringify(view)}});
      window.requested=(async()=>{await api.ready;document.querySelector('#outside').focus();api.focus();
        if('${operation}'==='state'){const state=api.getState();state.query.sort=[{column:'name',direction:'desc'}];await api.setState(state);}
        else if('${operation}'==='filter'||'${operation}'==='empty')await api.setQuery({filters:[{column:'name',operator:'eq',values:['${operation === 'empty' ? 'Missing' : 'Bravo'}']}]});
        else {const pending=api.reload();
          if('${operation}'==='reload-move')document.querySelector('#later').focus();
          if('${operation}'==='reload-destroy'){api.destroy();try{await pending;}catch(error){window.reloadAbort=error.name;}}
          else await pending;}
        document.querySelector('#panel').hidden=false;
      })();</script>`;
    await page.route('http://canopyx.test/hidden-query', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://canopyx.test/hidden-query'); await page.evaluate(() => window.requested);
    await nextFrames(page); await nextFrames(page);
    if (operation === 'reload-move') await expect(page.locator('#later')).toBeFocused();
    else if (operation === 'reload-destroy') {
      await expect(page.locator('.cx-grid')).toHaveCount(0); await expect(page.locator('#outside')).toBeFocused();
      expect(await page.evaluate(() => window.reloadAbort)).toBe('AbortError');
    } else if (operation === 'empty') {
      await expect(page.locator('.cx-grid')).toBeFocused(); await expect(page.locator('.cx-row')).toHaveCount(0);
    } else {
      await expect(page.locator(`.cx-row[data-cx-id="${operation === 'filter' ? 'b' : 'a'}"]`)).toBeFocused();
      if (operation === 'state') await expect(page.locator('.cx-row').first()).toHaveAttribute('data-cx-id', 'b');
    }
    expect(errors).toEqual([]);
  });
}

for (const reporting of [false, true]) for (const control of ['row', 'button', 'input']) {
  test(`native focus works immediately at readiness (${reporting ? 'reporting' : 'ordinary'}, ${control})`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const view = { protocol: 'canopyx/2', type: 'grid', id: 'native-ready', label: 'Records', pageSize: 100,
      selection: 'single', source: { kind: 'inline' }, columns: [{ id: 'name', title: 'Name', kind: 'text' }],
      rows: [{ id: 'a', cells: { name: 'Alpha' } }], ...(reporting ? { reporting: {} } : {}) };
    const { script, style } = runtimeAssets(reporting ? 'reporting' : 'grid');
    const html = `<!doctype html><style>${style}#host{width:600px;height:320px}</style><script>${script}</script>
      <div id="host"></div><script>
      const api=CanopyX.createDataGrid(document.querySelector('#host'),{view:${JSON.stringify(view)},
        renderers:{name:(_,cell)=>{const target=document.createElement('${control === 'row' ? 'span' : control}');
          target.id='native-control';target.textContent='Open';cell.append(target);return true;}}});
      window.requested=api.ready.then(()=>{const target=document.querySelector('${control === 'row' ? '.cx-row' : '#native-control'}');
        target.focus();window.focusedAtReady=document.activeElement===target;});
      </script>`;
    await page.route('http://canopyx.test/native-ready', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://canopyx.test/native-ready'); await page.evaluate(() => window.requested);
    expect(await page.evaluate(() => window.focusedAtReady)).toBe(true);
    await nextFrames(page); await nextFrames(page);
    await expect(page.locator(control === 'row' ? '.cx-row' : '#native-control')).toBeFocused();
    if (control === 'input') { await page.keyboard.type('Edited'); await expect(page.locator('#native-control')).toHaveValue('Edited'); }
    expect(errors).toEqual([]);
  });
}

for (const reporting of [false, true]) for (const action of ['focus', 'move', 'destroy']) {
  test(`ready focus survives the first fitted frame (${reporting ? 'reporting' : 'ordinary'}, ${action})`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const view = { protocol: 'canopyx/2', type: 'grid', id: 'ready-focus', label: 'Records', pageSize: 100,
      selection: 'single', source: { kind: 'inline' }, columns: [{ id: 'name', title: 'Name', kind: 'text' }],
      rows: [{ id: 'a', cells: { name: 'Alpha' } }], ...(reporting ? { reporting: {} } : {}) };
    const { script, style } = runtimeAssets(reporting ? 'reporting' : 'grid');
    const html = `<!doctype html><style>${style}#host{width:600px;height:320px}</style><script>${script}</script>
      <button id="outside">Outside</button><button id="later">Later</button><div id="host"></div><script>
      document.querySelector('#outside').focus();const api=CanopyX.createDataGrid(document.querySelector('#host'),{view:${JSON.stringify(view)}});
      window.requested=api.ready.then(()=>{api.focus();if('${action}'==='move')document.querySelector('#later').focus();if('${action}'==='destroy')api.destroy();});
      </script>`;
    await page.route('http://canopyx.test/ready-focus', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://canopyx.test/ready-focus');
    await page.evaluate(() => window.requested); await nextFrames(page); await nextFrames(page);
    if (action === 'focus') await expect(page.locator('.cx-row').first()).toBeFocused();
    // Removing a natively focused row returns focus to the body; no deferred request may steal it later.
    else await expect(page.locator(action === 'move' ? '#later' : 'body')).toBeFocused();
    if (action === 'destroy') await expect(page.locator('.cx-grid')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
