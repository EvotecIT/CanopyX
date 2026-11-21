# Toasts and notifications

A notification region shows short messages about what a page or a server did: a save, a finished sync, a certificate that
expires soon, a failure that needs attention. Toasts queue, carry a tone, pause their timeout while the reader is on them
and reach screen readers through a live region. They ship in the lazy `ui-toasts` part, which needs `ui-overlays`, and
work in static reports (`file://`, a nonce-based Content Security Policy, no CDN) as well as in live hosts.

- [Write a region from .NET](#write-a-region-from-net)
- [Show toasts from JavaScript](#show-toasts-from-javascript)
- [Push from a server](#push-from-a-server)
- [Toasts and flows](#toasts-and-flows)
- [Timeouts, focus and screen readers](#timeouts-focus-and-screen-readers)
- [Labels, direction and phones](#labels-direction-and-phones)

## Write a region from .NET

```csharp
using CanopyX.Html.Ui;

var notices = new CanopyToasts("notices", new CanopyToastsOptions {
    Position = CanopyToastPosition.BottomEnd, // where the toasts show; start and end follow the page direction
    Max = 3,                                   // shown at once; the rest wait in order
    Timeout = 6000                             // milliseconds; 0 keeps toasts until they are dismissed
});
notices.Items.Add(new CanopyToast("Collected 1,204 accounts from 3 domains.") {
    Id = "collected", Title = "Report ready", Tone = Tone.Success
});
string fragment = notices.ToHtmlFragment();
```

The builder encodes every text. A toast written into the page shows through the queue when the runtime mounts it. Without
the runtime the region reads as a plain list, so a report opened where scripts are blocked still says what happened.

Tones are the shared `Tone` names: `neutral`, `info` (the default), `success`, `warning`, `danger` and `muted`. A host
tone such as `Tone.Named("high")` takes its colour from `--hfx-color-status-high-fg`, as tones in cells and badges do.

## Show toasts from JavaScript

`CanopyX.notify(toast)` shows a toast in the region it used last, or else in the page's first `[data-cx-toasts]` region
that is not inside a closed dialog or hidden content, and creates one at the end of the body when there is none. It
resolves to the toast's id.

```javascript
await CanopyX.notify({ tone: 'success', title: 'Saved', message: 'Service settings were stored.' });

await CanopyX.notify({
  tone: 'neutral',
  message: 'Rule deleted.',
  actions: [{ id: 'undo', label: 'Undo', onSelect: () => restoreRule() }]
});
```

| Option | Meaning |
| --- | --- |
| `id` | Showing an id that is already shown or queued updates that toast in place and starts its timeout again. |
| `tone` | A tone name; `info` by default. |
| `title`, `message` | Plain text. A message is required unless `content` is given. |
| `content` | A Node, or trusted host HTML, shown instead of the message. |
| `timeout` | Milliseconds, 0 to 600000; 0 keeps the toast. Defaults to the region's timeout, or 0 for `danger` and for toasts with actions. |
| `actions` | Up to three `{ id, label, onSelect, href, close }`. A link (`href`) suits a toast a server sends. Selecting an action closes the toast unless `close` is `false`. |
| `dismissible` | `true` by default: a Dismiss button, and Escape inside the toast. |
| `onClose` | Called with `{ id, reason }`; the reason is `timeout`, `close`, `action`, `api` or `clear`. |

`CanopyX.toasts(target, options)` returns the region's controller: `show(toast)`, `close(id)`, `clear()` and `getState()`,
which returns `{ visible, queued }` as lists of ids. Its options (`position`, `max`, `timeout`, `labels`) replace the
declarative settings.

The root fires `cx-toasts:show` (`{ id }`), a cancelable `cx-toasts:action` (`{ id, action }`) and `cx-toasts:close`
(`{ id, reason }`). Cancelling an action event keeps the toast and skips the action's callback.

## Push from a server

A live host sends the same options as JSON, and the page passes them on. The id keeps one toast per job, so progress
updates replace each other instead of stacking:

```javascript
const events = new EventSource('/api/events');
events.addEventListener('notice', event => CanopyX.notify(JSON.parse(event.data)));
// The server sends, for example:
// { "id": "sync-contoso", "title": "Sync", "message": "Reading 3 domains…", "timeout": 0 }
// { "id": "sync-contoso", "tone": "success", "title": "Sync", "message": "Finished: 1,204 accounts." }
```

JSON cannot carry callbacks, so a pushed toast uses links for its actions (`{ "label": "Open report", "href": "/reports/42" }`).
Action links accept web addresses and relative paths; script addresses are refused.

## Toasts and flows

A flow raises `canopyx:flowSubmit`, and the host's answer says what happened. A page that combines flows and toasts loads
a grid entry point, which carries both (the slim flow entry point has no UI factories):

```javascript
// The host's answer: { status: "saved" | "accepted" | "error" | "conflict", message }.
document.addEventListener('canopyx:flowSubmitted', event => {
  const { status, message } = event.detail;
  if (message) CanopyX.notify({ tone: status === 'saved' ? 'success' : status === 'accepted' ? 'info' : 'danger', message });
});
```

## Timeouts, focus and screen readers

- The timeout pauses while the pointer is over the region, while focus is inside it and while the page is hidden. It
  resumes with the time that was left; nothing catches up.
- Each toast is announced once through a polite live region, or an assertive one for `danger`. The announcement starts with
  the tone in words ("Success", "Error"), so the colour is never the only signal. An update that changes the text is
  announced again.
- Toasts are in the Tab order where the region sits. Escape dismisses the focused toast. Closing the last toast returns focus
  to where the reader came from; closing one of several moves it to the next toast.
- While a modal dialog is open, everything outside it is inert, so the region joins the dialog and comes back when the dialog
  closes.
- Reduced motion turns off the entry animation. Forced colours keep the tone bar and icon visible. Printing keeps the toasts
  as a list without their buttons.

## Labels, direction and phones

The built-in locale packs translate `toastRegion`, `toastClose`, `toastQueued` and the tone words `toastInfo`, `toastSuccess`,
`toastWarning`, `toastDanger` and `toastNeutral` (host tones read as a notice). Pass `labels` to the region to override them.

The region sits at `top-start`, `top-center`, `top-end`, `bottom-start`, `bottom-center` or `bottom-end` (`CanopyToastPosition`
in .NET). Positions use logical sides, so `bottom-end` sits on the left in a right-to-left page. Below 40rem the region spans the
screen with a small margin, and its buttons grow to a touch-sized target.
