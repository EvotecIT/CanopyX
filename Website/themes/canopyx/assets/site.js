// CanopyX site behaviour: theme switch, header navigation, code blocks, grid tables, tabs, the table of contents and live frames.
(function () {
  'use strict';

  // /demos/ redirects to /views/ and keeps its hash; the old demo anchors open the view that replaced them.
  var legacyDemos = { files: 'files', inventory: 'inventory', outline: 'email', changes: 'changes' };
  if (/^\/views\/?(index\.html)?$/.test(location.pathname) && legacyDemos[location.hash.slice(1)]) {
    location.replace('/views/' + legacyDemos[location.hash.slice(1)] + '/');
    return;
  }

  var root = document.documentElement;
  var theme = function () { return root.dataset.theme === 'dark' ? 'dark' : 'light'; };
  var themeListeners = [];

  document.querySelectorAll('[data-cnx-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = theme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('cnx-theme', next); } catch (e) { /* storage unavailable */ }
      themeListeners.forEach(function (listener) { listener(next); });
    });
  });

  // The menu button opens the sidebar as a sheet on narrow screens; Escape closes it.
  var navToggle = document.getElementById('cnx-nav-toggle');

  // Thumbnails are CanopyX renders fetched when their slot is shown.
  function loadThumbs(scope) {
    scope.querySelectorAll('[data-cnx-thumb]').forEach(function (slot) {
      var src = slot.getAttribute('data-cnx-thumb');
      slot.removeAttribute('data-cnx-thumb');
      if (!window.fetch) return;
      fetch(src, { credentials: 'same-origin' }).then(function (response) {
        return response.ok ? response.text() : '';
      }).then(function (html) { if (html) slot.innerHTML = html; }, function () {});
    });
  }

  if (navToggle) {
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && navToggle.checked) { navToggle.checked = false; navToggle.focus(); }
    });
  }

  // The header's Views and Docs panels: a click toggles, hovering opens after a moment, Escape or a click outside closes.
  var menus = Array.prototype.slice.call(document.querySelectorAll('[data-cnx-menu]'));
  var menuStates = new Map();
  function setMenu(item, open) {
    var state = menuStates.get(item);
    if (state) { clearTimeout(state.timer); state.hoverOpened = false; }
    var button = item.querySelector('button[aria-expanded]');
    if (open) item.setAttribute('data-open', ''); else item.removeAttribute('data-open');
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeMenus(except) { menus.forEach(function (item) { if (item !== except) setMenu(item, false); }); }
  menus.forEach(function (item) {
    var button = item.querySelector('button[aria-expanded]');
    var state = { timer: 0, hoverOpened: false };
    menuStates.set(item, state);
    button.addEventListener('click', function () {
      var open = !item.hasAttribute('data-open') || state.hoverOpened;
      closeMenus(item);
      setMenu(item, open);
    });
    item.addEventListener('mouseenter', function () {
      if (!matchMedia('(hover: hover)').matches) return;
      clearTimeout(state.timer);
      if (item.hasAttribute('data-open')) return;
      state.timer = setTimeout(function () { closeMenus(item); setMenu(item, true); state.hoverOpened = true; }, 80);
    });
    item.addEventListener('mouseleave', function () {
      clearTimeout(state.timer);
      state.timer = setTimeout(function () { setMenu(item, false); }, 160);
    });
    item.addEventListener('focusout', function (event) {
      if (!item.contains(event.relatedTarget)) setMenu(item, false);
    });
  });
  if (menus.length) {
    document.addEventListener('click', function (event) {
      if (!event.target.closest('[data-cnx-menu]')) closeMenus(null);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var open = menus.filter(function (item) { return item.hasAttribute('data-open'); })[0];
      if (!open) return;
      setMenu(open, false);
      open.querySelector('button').focus();
    });
  }

  // Docs map and other inline thumbnails that were not rendered into the page.
  document.querySelectorAll('main [data-cnx-thumb]').forEach(function (slot) { loadThumbs(slot.parentNode); });

  // Every tab carries the sort indicator of the shared tab component.
  document.querySelectorAll('.cnx-tabs [role="tab"]').forEach(function (tab) {
    if (tab.querySelector('.cnx-tab__sort')) return;
    var sort = document.createElement('span');
    sort.className = 'cnx-tab__sort';
    sort.setAttribute('aria-hidden', 'true');
    tab.appendChild(sort);
  });

  function wireCopy(button, text) {
    button.addEventListener('click', function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(text()).then(function () {
        button.setAttribute('data-copied', '');
        button.textContent = 'Copied';
        setTimeout(function () { button.removeAttribute('data-copied'); button.textContent = 'Copy'; }, 1600);
      }, function () {});
    });
  }

  document.querySelectorAll('[data-cnx-copy]').forEach(function (button) {
    wireCopy(button, function () { return button.getAttribute('data-cnx-copy'); });
  });

  // One code block component: Markdown blocks get the same caption bar as the hand-written ones.
  var languages = {
    csharp: 'C#', cs: 'C#', javascript: 'JavaScript', js: 'JavaScript', typescript: 'TypeScript', ts: 'TypeScript',
    html: 'HTML', markup: 'HTML', xml: 'XML', shell: 'Shell', bash: 'Shell', sh: 'Shell', powershell: 'PowerShell',
    ps1: 'PowerShell', json: 'JSON', css: 'CSS', yaml: 'YAML'
  };
  function languageOf(code) {
    var match = /(?:^|\s)language-([\w-]+)/.exec(code.className || '');
    return match ? match[1].toLowerCase() : '';
  }

  document.querySelectorAll('.cnx-prose pre > code').forEach(function (code) {
    var pre = code.parentNode;
    if (pre.closest('.cnx-codeblock')) return;
    var figure = document.createElement('figure');
    figure.className = 'cnx-codeblock';
    var bar = document.createElement('figcaption');
    bar.className = 'cnx-codeblock__bar';
    var lang = document.createElement('span');
    lang.className = 'cnx-codeblock__lang';
    lang.textContent = languages[languageOf(code)] || 'Code';
    bar.appendChild(lang);
    pre.parentNode.insertBefore(figure, pre);
    figure.appendChild(bar);
    figure.appendChild(pre);
  });

  document.querySelectorAll('.cnx-codeblock').forEach(function (figure) {
    var bar = figure.querySelector('.cnx-codeblock__bar');
    var pres = figure.querySelectorAll('pre');
    if (!bar || !pres.length) return;
    var label = bar.querySelector('.cnx-codeblock__file') || bar.querySelector('.cnx-codeblock__lang');
    Array.prototype.forEach.call(pres, function (pre) {
      pre.tabIndex = 0;
      if (label && !pre.hasAttribute('aria-labelledby')) pre.setAttribute('aria-label', 'Code: ' + label.textContent);
    });
    if (bar.querySelector('.cnx-codeblock__copy')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'cnx-copy cnx-codeblock__copy';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code');
    bar.appendChild(button);
    wireCopy(button, function () {
      var visible = figure.querySelector('[role="tabpanel"]:not([hidden]) code') || figure.querySelector('pre:not([hidden]) code') || figure.querySelector('pre code');
      return visible ? visible.textContent.replace(/\n$/, '') : '';
    });
  });

  // Markdown tables become grid tables that scroll inside their frame on narrow screens.
  document.querySelectorAll('.cnx-prose > table, .markdown-body > table').forEach(function (table) {
    if (table.closest('.cnx-gridtable')) return;
    var wrap = document.createElement('div');
    wrap.className = 'cnx-gridtable';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
    if (wrap.scrollWidth > wrap.clientWidth + 1) {
      wrap.tabIndex = 0;
      wrap.setAttribute('role', 'region');
      var head = table.querySelector('th');
      wrap.setAttribute('aria-label', 'Table' + (head ? ': ' + head.textContent : ''));
    }
  });

  // Mark the section being read in the table of contents.
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.cnx-docs__toc a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (link) { byId[decodeURIComponent(link.getAttribute('href').slice(1))] = link; });
    var headings = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var markCurrent = function () {
      var currentId = headings[0] ? headings[0].id : '';
      headings.forEach(function (heading) { if (heading.getBoundingClientRect().top < 140) currentId = heading.id; });
      tocLinks.forEach(function (link) { link.removeAttribute('aria-current'); });
      if (byId[currentId]) byId[currentId].setAttribute('aria-current', 'location');
    };
    var spy = new IntersectionObserver(markCurrent, { rootMargin: '-80px 0px -55% 0px', threshold: [0, 1] });
    headings.forEach(function (heading) { spy.observe(heading); });
    markCurrent();
  }

  // Accessible tabs: arrow keys move between tabs, Home/End jump to the ends.
  // Demo lists become horizontal rows on narrow pages; keep their keyboard model in sync.
  var narrowDemos = matchMedia('(max-width: 1100px)');
  function syncDemoOrientation() {
    document.querySelectorAll('.cnx-view__demos--list .cnx-demotabs').forEach(function (list) {
      list.setAttribute('aria-orientation', narrowDemos.matches ? 'horizontal' : 'vertical');
    });
  }
  syncDemoOrientation();
  narrowDemos.addEventListener('change', syncDemoOrientation);

  function wireTabs(tabs, onSelect) {
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { onSelect(tab); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        var vertical = tab.closest('[aria-orientation="vertical"]');
        if (event.key === (vertical ? 'ArrowDown' : 'ArrowRight')) next = tabs[(index + 1) % tabs.length];
        if (event.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (next) { event.preventDefault(); next.focus(); onSelect(next); }
      });
    });
  }

  function selectTab(tabs, active) {
    tabs.forEach(function (tab) {
      var selected = tab === active;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
  }

  document.querySelectorAll('[data-cnx-tabs]').forEach(function (group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]'));
    wireTabs(tabs, function (tab) { selectTab(tabs, tab); });
  });

  // Demo frames are same-origin CanopyX pages; give their grid hosts the site's theme.
  function syncFrameTheme(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc) return;
      doc.documentElement.style.colorScheme = theme();
      doc.querySelectorAll('[data-cx-theme]').forEach(function (host) { host.setAttribute('data-cx-theme', theme()); });
    } catch (e) { /* frame not ready */ }
  }

  // A frame's grid may mount after the load event (a module script, a sidecar manifest), so sync once more shortly after.
  function watchFrame(frame) {
    frame.addEventListener('load', function () {
      syncFrameTheme(frame);
      setTimeout(function () { syncFrameTheme(frame); }, 400);
    });
  }

  // A demo written as separate light and dark pages (data-src-dark) loads the one that matches the site theme.
  function frameSource(frame) {
    var dark = frame.getAttribute('data-src-dark');
    return dark && theme() === 'dark' ? dark : frame.getAttribute('data-src');
  }

  function loadFrame(frame) {
    if (!frame || frame.getAttribute('src')) return;
    watchFrame(frame);
    frame.setAttribute('src', frameSource(frame));
  }

  // Frames load when they come near the viewport, so a page of demos does not open every one at once.
  var lazyFrames = document.querySelectorAll('[data-cnx-frame][data-src]:not([data-cnx-stage] [data-cnx-frame])');
  if ('IntersectionObserver' in window) {
    var frameObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        frameObserver.unobserve(entry.target);
        loadFrame(entry.target);
      });
    }, { rootMargin: '400px' });
    lazyFrames.forEach(function (frame) { frameObserver.observe(frame); });
  } else {
    lazyFrames.forEach(loadFrame);
  }
  // Frames that load lazily by themselves (documentation output) only need the theme.
  document.querySelectorAll('iframe[data-cnx-frame][src]').forEach(function (frame) {
    watchFrame(frame);
    syncFrameTheme(frame);
  });

  themeListeners.push(function () {
    document.querySelectorAll('[data-cnx-frame][src]').forEach(function (frame) {
      if (frame.hasAttribute('data-src-dark')) frame.setAttribute('src', frameSource(frame));
      else syncFrameTheme(frame);
    });
  });

  // The bottom of the lowest visible piece of content in a frame: text, controls and drawings, not the containers that
  // stretch to the frame's height.
  function contentBottom(doc) {
    var win = doc.defaultView, bottom = 0, seen = 0;
    var all = doc.body ? doc.body.getElementsByTagName('*') : [];
    for (var i = 0; i < all.length && seen < 6000; i++) {
      var el = all[i];
      var drawn = /^(svg|canvas|img|input|select|textarea|button|video)$/i.test(el.tagName);
      if (el.childElementCount && !drawn) continue;
      if (!drawn && !el.textContent.trim()) continue;
      seen++;
      var rect = el.getBoundingClientRect();
      if (!rect.height || !rect.width) continue;
      if (win.getComputedStyle(el).visibility === 'hidden') continue;
      bottom = Math.max(bottom, rect.bottom + win.scrollY);
    }
    return bottom;
  }

  // A demo frame takes the height of its page: a page that scrolls grows the frame, a short page shrinks it, and a view
  // that fills whatever height it gets keeps the default.
  function fitFrame(frame, screen) {
    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.body || !screen) return;
      var height = frame.getBoundingClientRect().height, want = height;
      var page = doc.documentElement.scrollHeight;
      // A scroll area inside the view that is only a little short (not a virtual list of thousands of rows) means
      // the frame clips the page's own layout; grow by the difference.
      var short = 0, all = doc.body.getElementsByTagName('*');
      for (var i = 0; i < all.length && i < 8000; i++) {
        var el = all[i], over = el.scrollHeight - el.clientHeight;
        if (over > 2 && over < 260 && el.clientHeight > 40 && /auto|scroll/.test(doc.defaultView.getComputedStyle(el).overflowY)) short = Math.max(short, over);
      }
      if (short) want = height + short + 4;
      else if (page > height + 2) want = page;
      else {
        var bottom = contentBottom(doc);
        if (bottom && bottom < height - 48) want = bottom + 20;
      }
      want = Math.round(Math.min(Math.max(want, 240), Math.max(560, window.innerHeight - 120), 980));
      if (Math.abs(want - height) > 12) screen.style.setProperty('--cnx-fit', want + 'px');
    } catch (e) { /* frame not ready */ }
  }

  function watchFit(frame, screen) {
    if (!screen || frame.hasAttribute('data-cnx-fit')) return;
    frame.setAttribute('data-cnx-fit', '');
    var timer = 0;
    var fit = function () { clearTimeout(timer); timer = setTimeout(function () { if (!frame.closest('[hidden]')) fitFrame(frame, screen); }, 120); };
    frame.addEventListener('load', function () {
      fit();
      setTimeout(fit, 600);
      setTimeout(fit, 1500);
      try {
        if (window.ResizeObserver) new frame.contentWindow.ResizeObserver(fit).observe(frame.contentDocument.body);
        frame.contentDocument.addEventListener('click', function () { setTimeout(fit, 250); });
      } catch (e) { /* frame not ready */ }
    });
    frame.cnxFit = fit;
  }

  var stage = document.querySelector('[data-cnx-stage]');
  if (stage) {
    var stageTabs = Array.prototype.slice.call(stage.querySelectorAll('[role="tab"]'));
    var open = stage.querySelector('[data-cnx-demo-open]');
    var screen = stage.querySelector('.cnx-frame__screen');
    var show = function (tab) {
      selectTab(stageTabs, tab);
      var id = tab.getAttribute('data-cnx-demo');
      stage.querySelectorAll('[data-cnx-caption]').forEach(function (caption) {
        caption.hidden = caption.getAttribute('data-cnx-caption') !== id || !caption.textContent.trim();
      });
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      var frame = panel ? panel.querySelector('[data-cnx-frame]') : null;
      if (screen) screen.style.removeProperty('--cnx-fit');
      if (frame) {
        watchFit(frame, screen);
        if (frame.getAttribute('src')) setTimeout(frame.cnxFit, 50);
      }
      loadFrame(frame);
      if (open) {
        open.hidden = !frame;
        if (frame) open.href = frameSource(frame);
      }
    };
    wireTabs(stageTabs, show);
    window.addEventListener('resize', function () {
      var frame = stage.querySelector('[role="tabpanel"]:not([hidden]) [data-cnx-frame][data-cnx-fit]');
      if (frame && frame.cnxFit) frame.cnxFit();
    });

    // A demo with a separate dark page swaps its frame on a theme change; the full-screen link follows it.
    themeListeners.push(function () {
      if (!open) return;
      var panel = document.getElementById(current().getAttribute('aria-controls'));
      var frame = panel ? panel.querySelector('[data-cnx-frame]') : null;
      if (frame) open.href = frameSource(frame);
    });

    // Load the selected demo once the stage is near the viewport.
    var current = function () {
      return stageTabs.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })[0] || stageTabs[0];
    };
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          observer.disconnect();
          show(current());
        }
      }, { rootMargin: '200px' });
      observer.observe(stage);
    } else {
      show(current());
    }
  }
})();
