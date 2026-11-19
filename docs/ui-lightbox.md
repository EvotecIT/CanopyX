# Gallery and lightbox

A gallery is a grid of thumbnails whose items open in a viewer: images, pages and documents in a frame, or host content such
as a summary card. The viewer is the shared modal dialog, so it traps focus, closes with Escape, locks page scrolling and
returns focus to the thumbnail. It ships in the lazy `ui-lightbox` part, which needs `ui-overlays`, and works in static
reports (`file://`, a nonce-based Content Security Policy, no CDN) as well as in live hosts.

## Write a gallery from .NET

```csharp
using CanopyX.Html.Ui;

var gallery = new CanopyGallery("photos", new CanopyGalleryOptions { Loop = false, ShowCaptions = true });
gallery.Items.Add(new CanopyGalleryItem("images/rack-a.jpg", "Rack A") {
    ThumbnailHref = "images/rack-a-small.jpg", Caption = "Rack A after the move", Width = 320, Height = 200
});
gallery.Items.Add(new CanopyGalleryItem("manual.pdf", "Installation manual") { Type = CanopyGalleryItemType.Frame });
gallery.Items.Add(new CanopyGalleryItem("inventory", "Inventory summary") {
    Type = CanopyGalleryItemType.Content, Caption = "Inventory summary",
    ContentHtml = "<h3>Inventory</h3><p>12 servers, 4 switches.</p>"  // trusted host HTML
});
string fragment = gallery.ToHtmlFragment();
```

Each image or frame thumbnail is a link to its item, so without the runtime a click still opens the image or document. A
content item travels in a `<template>` beside the gallery and needs the runtime to show; give a static report a frame or image
item when it must open without scripts. The builder encodes addresses and text and refuses script addresses, addresses with control characters, and
data addresses that are not images; the runtime refuses script addresses in items too. Images can be files beside the report or `data:image/` addresses, which keep a report to one file.

`Width` and `Height` reserve a thumbnail's space before it loads. An item without a thumbnail (a frame or content item)
shows its alternative text as a link.

## Open the viewer from JavaScript

Declarative galleries mount when the page loads. A host can bind its own markup, marking each link with
`data-lightbox-item` (and `data-lightbox-type="frame"` or `"content"`, `data-caption`), or pass items directly:

```javascript
const viewer = CanopyX.lightbox('#evidence', {
  loop: true,
  items: [
    { src: '/shots/before.png', alt: 'Before the change', caption: 'Before' },
    { src: '/shots/after.png', alt: 'After the change', caption: 'After' },
    { type: 'frame', src: '/reports/change-42.pdf', caption: 'Change record' },
    { type: 'content', content: summaryNode, caption: 'Summary' }
  ]
});
await viewer.ready;
viewer.open(0);
```

| Member | Result |
| --- | --- |
| `open(indexOrId, { returnFocus })` | Opens the viewer at an index or item id. |
| `next()`, `back()` | Moves between items; at the ends they do nothing unless `loop` is set. |
| `zoom(level)` | Zooms the current image, 1 (fitted) to 4, and returns the zoom applied. |
| `close()`, `getState()` | Closes the viewer; `{ open, index, total, zoom }`. |

The root fires `cx-lightbox:change` (`{ index, item, source }`, where the source is `link`, `navigation` or `api`), and the
viewer fires `cx-lightbox:open` and `cx-lightbox:close`.

## Keys, swipes and zoom

| Input | Action |
| --- | --- |
| Left and Right arrows | Previous and next item (mirrored in right-to-left pages). |
| Home, End | First and last item. |
| `+`, `-`, `0` | Zoom in, zoom out, fit to the screen. |
| Double-click | Zoom to 200% and back. |
| Swipe | Previous and next item on a touch screen. |
| Escape | Closes the viewer and returns focus to the thumbnail. |

Zoom steps through 150%, 200%, 300% and 400%. A zoomed image pans by scrolling, by dragging with the mouse, and with the arrow
keys once the stage has focus; while it is zoomed the arrows pan instead of moving between items. Moving to another item
resets the zoom. A frame keeps its own keys.

## Accessibility, labels and phones

The viewer is named by the item's caption (or its alternative text), and its position ("2 of 5") and zoom level are
announced as they change. An item that does not load says so in place. The viewer loads the next and previous images ahead.

The built-in locale packs translate `lightboxTitle`, `lightboxPrevious`, `lightboxNext`, `lightboxZoomIn`, `lightboxZoomOut`,
`lightboxZoomReset` and `lightboxError`; the close button uses `dialogClose` and the position `tabsPosition`. Pass `labels`
to override them.

Below 40rem the viewer fills the screen and its buttons grow to a touch-sized target, with Previous and Next at the bottom
corners. Reduced motion turns off the opening animation, and printing leaves the viewer out and the thumbnails in.
