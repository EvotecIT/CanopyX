# UI primitives

Tabs, steppers, dialogs, drawers, popovers, tooltips and menus work on their own or beside CanopyX data views. The runtime loads their versioned parts when a component is mounted. Serve the `canopyx-ui-*.js` and `.css` files beside the entry point, together with its other part files. `CanopyHtmlAssets.WriteTo(...)` writes that asset set from .NET.

## Write a tab set from .NET

```csharp
using CanopyX.Html;
using CanopyX.Html.Ui;

var tabs = new CanopyTabs("workspace", "Workspace sections");
tabs.Tabs.Add(new CanopyTab("overview", "Overview") {
    ContentHtml = "<p>Workspace summary.</p>"
});
tabs.Tabs.Add(new CanopyTab("activity", "Activity") {
    Badge = "12",
    ContentHtml = "<p>Recent activity.</p>"
});

string fragment = tabs.ToHtmlFragment();
CanopyHtmlAssets.WriteTo("assets");
```

Include the runtime and its base stylesheet once in the page that contains `fragment`. Declarative components mount when the document loads. A host that inserts markup later calls `CanopyX.mountUi(container)` and awaits the returned controllers' `ready` promises.

The builders encode identities, labels, badges and accessibility references. Properties named `ContentHtml` or `FooterHtml` contain trusted host HTML; encode or sanitize untrusted content before assigning them. Without JavaScript, tab and step panels remain readable with headings. Overlay builders emit their closed content and a separate `ToTriggerHtmlFragment(label)` button.

For a self-contained page, embed the required UI parts using `CanopyHtmlAssets.GetPart(name).Markup`. Include each part's `Requires` dependencies too. The `ui-primitives.html` example embeds all six UI parts as inert payloads; they execute only when loaded by the runtime. Use `GetMarkup(nonce)` for a page protected by a nonce-based Content Security Policy.

## Configure behavior in JavaScript

The tree, grid and reporting entry points expose the same UI factories. The slim flow entry point contains forms and flows; use a grid entry point for a page combining flows and these UI controls. Each factory returns a stable controller immediately; `ready` resolves after its part and dependencies have loaded. Calls made before readiness wait for initialization.

```javascript
const sections = CanopyX.tabs('#workspace', {
  hash: true,
  beforeChange: async (from, to, signal) => {
    return await confirmSectionChange(from?.id, to.id, signal);
  }
});

await sections.ready;
await sections.select('activity');
// When the host removes this part of its page:
sections.destroy();
```

Tabs support underline, pills, segmented and vertical styles; scroll, More and pill-wrap overflow; deferred panels; hash state; and optional automatic progression with a visible Pause/Play control. A deferred loader receives the destination record and an `AbortSignal`. New navigation cancels stale guards and loaders. `keepAlive: false` reloads deferred content after leaving it.

### Automatic tab progression

```javascript
const sections = CanopyX.tabs('#workspace', {
  autoProgress: { interval: 5000, pauseOnHover: true, pauseOnFocus: true }
});
await sections.ready;
```

`interval` is a positive number of milliseconds. Both pause options default to `true`.
Progression waits for the initial panel, skips disabled tabs, and wraps after the last enabled tab.
Each interval starts after the previous selection and its deferred content settle. A rejected change
pauses progression. Hover, focus and a hidden document suspend the timer without catching up later.

The visible, keyboard-accessible Pause/Play button gives readers control over automatic updates
as required by WCAG 2.2.2. Selecting a tab by click, keyboard, picker, swipe, hash navigation or
the controller stops progression, including attempts to select the current or a disabled tab.
Leaving hover or focus does not restart a stopped timer; Play explicitly starts a fresh interval.
Pause cancels a pending automatic selection without taking ownership of manual navigation.

Reduced motion disables automatic selection and the animated progress fill. Play remains disabled,
with a localized explanation. Changing to reduced motion cancels a pending automatic guard or
loader. Changing back leaves progression paused until Play. Manual navigation remains available.
The built-in locale packs supply `tabsPause`, `tabsPlay` and `tabsMotionDisabled`; pass a locale's
`labels` or override those keys in the component's `labels` option.

The .NET builder emits the same settings as declarative attributes:

```csharp
var tabs = new CanopyTabs("workspace", "Workspace sections", new CanopyTabsOptions {
    AutoProgress = new CanopyTabsAutoProgress {
        Interval = 5000,
        PauseOnHover = true,
        PauseOnFocus = true
    }
});
tabs.Tabs.Add(new CanopyTab("overview", "Overview") { ContentHtml = "<p>Summary.</p>" });
tabs.Tabs.Add(new CanopyTab("activity", "Activity") { ContentHtml = "<p>Recent activity.</p>" });
string fragment = tabs.ToHtmlFragment();
```

`AutoProgress` defaults to null (off); a new settings object defaults to a 5000 ms interval.
JavaScript `autoProgress` replaces the declarative settings, and `autoProgress: false` disables them.
Before 1.0, replace `autoAdvance` with `autoProgress` and remove `loop`; progression wraps through
enabled tabs. No compatibility alias is provided.

`CanopyX.stepper(root, options)` adds guarded steps, optional skipping, validation, drafts and finish callbacks. A validation callback returns `false` or a list of messages to keep the current step open. Messages appear in a focused alert and are linked to invalid fields. Report and static stepper modes remain script-free. Tabs and interactive steppers share the same phone picker, preserving badges and counts. Tabs measure their labels, icons and badges before collapsing, with an eight-pixel resize margin to prevent repeated switching near the boundary. Menu overflow keeps at least three visible choices plus More while they fit. Interactive steppers use the picker below a container width of 640 px.

## Open overlays

Use `CanopyX.dialog`, `drawer`, `popover`, `tooltip` and `menu` with their declarative roots. The returned controllers expose `open`, `close`, `refresh` and `destroy` as applicable. A trigger can come from the builder's `data-cx-trigger` reference or the `trigger` option.

Dialogs use the native modal dialog. Drawers are non-modal on desktop and become full-height modal sheets when their container narrows below 640 px. `modal: true` also makes a desktop drawer modal. The shared overlay manager handles nested Escape order, modal focus trapping, scroll locking, dismissal and focus return. Anchored overlays flip and shift within the viewport.

An overlay copies its host's resolved scheme and scoped design roles when moved outside that host. Its colors, typography, spacing, radii, elevation and motion consume `--hfx-*` roles with standalone fallbacks. Use `data-theme="light"` or `"dark"` on a standalone component, or supply roles from its parent. Component styles live in `@layer hfx.components`; a product layer can restyle public `data-hfx-part`, `data-state` and `data-hfx-variant` hooks.

## Add a context menu

```javascript
const record = document.querySelector('#report-record');
const dispose = CanopyX.contextMenu(record, [
  { id: 'open', label: 'Open record' },
  { id: 'pin', label: 'Pin record', kind: 'checkbox', checked: false }
], {
  onSelect(item) {
    handleRecordAction(item.id, record, item.checked);
  }
});

await dispose.ready;
// Remove listeners, timers and any open menu:
dispose();
```

A selector delegates to matching elements; an element binds directly. The factory receives the opening event and matched element. Actions remain host callbacks. CanopyX does not perform domain writes. Menus support action, checkbox, radio, separator, group and submenu entries, disabled states, badges, shortcuts and host-rendered icons.

Right-click, Shift+F10, the Context Menu key and a 500 ms touch press open the same menu. Touch uses a sheet. Links, editable controls, selected text and Shift+right-click retain the browser menu. A scrolling gesture cancels the pending touch press.

## Keyboard, labels and print

Tabs use roving focus, arrow keys and Home/End; guarded or deferred tabs use manual activation unless explicitly overridden. Menu buttons open with Enter, Space or ArrowDown. Menus use arrow keys, Home/End, typeahead and logical submenu arrows. Disabled tabs and menu items remain focusable and announce their disabled state.

Pass translated `labels` in component options. The built-in locale packs include UI strings in Polish, German, Spanish, French and Italian. Content labels and action names remain host-owned.

Print shows tab and stepper panels with headings and omits overlays. Tabs print all panels by default; `print: 'selected'` includes only the selected panel and does not fetch inactive content.

For deferred content, await `preparePrint()` before opening the print dialog:

```javascript
const sections = CanopyX.tabs('#workspace', {
  tabs: [{ id: 'activity', loader: async (item, signal) => {
    const response = await fetch('/workspace/activity', { signal });
    if (!response.ok) throw new Error('Activity could not be loaded');
    return await response.text(); // Trusted host HTML.
  } }]
});
await sections.ready;
await sections.preparePrint();
window.print();
```

Interactive steppers expose the same `preparePrint(): Promise<void>` method. `ready` covers component initialization and the initial panel; it does not load every deferred panel. `preparePrint()` waits for pending panel content and prepares the bodies required by the print mode. A loader failure rejects the promise, so the host can offer retry before calling `window.print()`. Destruction or an `afterprint` event cancels pending preparation with `AbortError`; late results are ignored. Concurrent preparation calls share the pending work.

The browser's synchronous `beforeprint` event materializes unvisited local templates and cached bodies. It cannot wait for asynchronous loaders: browser-menu printing without preparation may omit unloaded remote content. Preparation calls loaders only when required for printing, without changing selection, running navigation guards, marking steps visited, or replacing live form nodes. Loaders should return content and honor the supplied signal; they must not mutate the live panel themselves. A returned node is cloned for printing.

Deferred bodies cleared by `keepAlive: false` retain a detached snapshot for printing, including current form values. Print-only projections remain hidden on screen and are removed, together with their snapshots, after printing or destruction. Projection copies are inert; their IDs, control names and explicit form associations are removed to protect live forms. Style print content through classes. Normal navigation still reloads disposed bodies. Prepare again for each print attempt after content or selection changes; preparation does not wait for images, fonts, or host work outside the content loaders.

Reduced-motion preferences make navigation transitions and overlay motion instant. Forced-color styles retain borders, focus rings and state glyphs.
