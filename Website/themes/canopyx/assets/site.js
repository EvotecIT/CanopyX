// CanopyX site behaviour: theme switch, copy buttons, tabs and the live demo stage.
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

  document.querySelectorAll('[data-cnx-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) return;
      navigator.clipboard.writeText(button.getAttribute('data-cnx-copy')).then(function () {
        var label = button.textContent;
        button.setAttribute('data-copied', '');
        button.textContent = 'Copied';
        setTimeout(function () { button.removeAttribute('data-copied'); button.textContent = label; }, 1600);
      }, function () {});
    });
  });

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

  function loadFrame(frame) {
    if (!frame || frame.getAttribute('src')) return;
    frame.addEventListener('load', function () { syncFrameTheme(frame); });
    frame.setAttribute('src', frame.getAttribute('data-src'));
  }

  document.querySelectorAll('[data-cnx-frame][data-eager]').forEach(loadFrame);

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
