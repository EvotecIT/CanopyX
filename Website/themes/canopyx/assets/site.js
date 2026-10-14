// CanopyX site behaviour: theme switch, header navigation, code blocks, grid tables, tabs, the table of contents and live frames.
(function () {
  'use strict';

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

  // Header navigation. Each group button discloses its panel: one panel at a time on wide screens, closed by Escape,
  // a click outside or tabbing out of the group. The phone sheet lists every group open. A panel's thumbnails are
  // CanopyX renders fetched the first time the group is hovered, focused or opened.
  var header = document.querySelector('[data-cnx-header]');
  var compactNav = window.matchMedia('(max-width: 900px)');
  var navToggle = document.getElementById('cnx-nav-toggle');

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

  if (header) {
    var groups = Array.prototype.slice.call(header.querySelectorAll('[data-cnx-navgroup]'));
    var triggerOf = function (group) { return group.querySelector('.cnx-navgroup__trigger'); };
    var setOpen = function (group, open) {
      triggerOf(group).setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && !compactNav.matches) loadThumbs(group);
    };
    var closeAll = function (except) { groups.forEach(function (group) { if (group !== except) setOpen(group, false); }); };

    groups.forEach(function (group) {
      var trigger = triggerOf(group);
      var links = Array.prototype.slice.call(group.querySelectorAll('.cnx-navitem__link'));
      var warm = function () { if (!compactNav.matches) loadThumbs(group); };
      trigger.addEventListener('pointerenter', warm);
      trigger.addEventListener('focus', warm);
      trigger.addEventListener('click', function () {
        var open = trigger.getAttribute('aria-expanded') !== 'true';
        if (!compactNav.matches) closeAll(group);
        setOpen(group, open);
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown' || compactNav.matches || !links.length) return;
        event.preventDefault();
        closeAll(group);
        setOpen(group, true);
        links[0].focus();
      });
      group.addEventListener('keydown', function (event) {
        var index = links.indexOf(document.activeElement);
        if (event.key === 'Escape' && !compactNav.matches && trigger.getAttribute('aria-expanded') === 'true') {
          setOpen(group, false);
          trigger.focus();
        } else if (index >= 0 && !compactNav.matches && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
          event.preventDefault();
          var step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
          links[(index + step + links.length) % links.length].focus();
        }
      });
      group.addEventListener('focusout', function (event) {
        if (!compactNav.matches && event.relatedTarget && !group.contains(event.relatedTarget)) setOpen(group, false);
      });
    });

    document.addEventListener('click', function (event) {
      if (!compactNav.matches && !header.contains(event.target)) closeAll(null);
    });
    var reset = function () {
      if (compactNav.matches) groups.forEach(function (group) { setOpen(group, true); });
      else { closeAll(null); if (navToggle) navToggle.checked = false; }
    };
    if (compactNav.addEventListener) compactNav.addEventListener('change', reset);
    reset();
  }

  if (navToggle) {
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && navToggle.checked && compactNav.matches) { navToggle.checked = false; navToggle.focus(); }
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
      var visible = figure.querySelector('pre:not([hidden]) code') || figure.querySelector('pre code');
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
  function wireTabs(tabs, onSelect) {
    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () { onSelect(tab); });
      tab.addEventListener('keydown', function (event) {
        var next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
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

  function loadFrame(frame) {
    if (!frame || frame.getAttribute('src')) return;
    watchFrame(frame);
    frame.setAttribute('src', frame.getAttribute('data-src'));
  }

  document.querySelectorAll('[data-cnx-frame][data-eager]').forEach(loadFrame);
  // Frames that load lazily by themselves (documentation output) only need the theme.
  document.querySelectorAll('iframe[data-cnx-frame][src]').forEach(function (frame) {
    watchFrame(frame);
    syncFrameTheme(frame);
  });

  themeListeners.push(function () {
    document.querySelectorAll('[data-cnx-frame][src]').forEach(syncFrameTheme);
  });

  var stage = document.querySelector('[data-cnx-stage]');
  if (stage) {
    var stageTabs = Array.prototype.slice.call(stage.querySelectorAll('[role="tab"]'));
    var open = stage.querySelector('[data-cnx-demo-open]');
    var show = function (tab) {
      selectTab(stageTabs, tab);
      var id = tab.getAttribute('data-cnx-demo');
      stage.querySelectorAll('[data-cnx-caption]').forEach(function (caption) {
        caption.hidden = caption.getAttribute('data-cnx-caption') !== id;
      });
      var panel = document.getElementById(tab.getAttribute('aria-controls'));
      var frame = panel ? panel.querySelector('[data-cnx-frame]') : null;
      loadFrame(frame);
      if (open) {
        open.hidden = !frame;
        if (frame) open.href = frame.getAttribute('data-src');
      }
    };
    wireTabs(stageTabs, show);

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
