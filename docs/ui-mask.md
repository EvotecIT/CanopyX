# Input masks

A live mask on any text input: separators appear as the reader types, characters a position does not take are dropped, and
the value never grows past the mask. It suits addresses, identifiers, codes and dates typed as text. It ships in the lazy
`ui-mask` part and works on plain inputs anywhere on a page; without the runtime the input stays an ordinary text field.

## Write a masked input

```csharp
using CanopyX.Html.Ui;

string fragment = new CanopyMaskedInput("asset", "asset", "Asset tag", "AAA-0000") { Placeholder = "ABC-1234" }.ToHtmlFragment();
```

Any input becomes masked with a `data-cx-mask` attribute, or from script:

```html
<input type="text" name="mac" aria-label="MAC address" data-cx-mask="mac">
```

```javascript
const code = CanopyX.mask('#colour', { mask: '\\#hhhhhh', onChange: state => preview(state.text) });
await code.ready;
code.getState();   // { text: '#ff00aa', raw: 'ff00aa', complete: true }
```

## Patterns and presets

| Character | Takes |
| --- | --- |
| `0` | a digit |
| `a` | a letter |
| `A` | a letter, made upper case |
| `h` | a hex digit |
| `*` | a letter or a digit |
| `\` | makes the next character literal |
| anything else | a literal separator |

| Preset | Pattern |
| --- | --- |
| `ipv4` | Up to four octets of one to three digits; a dot follows a third digit, and a number above 255 starts the next octet. |
| `mac` | `hh:hh:hh:hh:hh:hh` |
| `guid` | `hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh` |
| `date`, `time`, `time-seconds`, `date-time` | `0000-00-00`, `00:00`, `00:00:00`, `0000-00-00 00:00` |
| `postcode`, `credit-card` | `00-000`, `0000 0000 0000 0000` |

Separators are added just before the next position is filled, so Backspace removes a separator together with what follows it
instead of fighting it. Pasted text is fitted the same way, and the caret stays after the same characters. Digit-only masks set
`inputmode="numeric"` (IPv4 sets `decimal`, which has the dot key), and the mask caps the length itself, so a pasted
`12 - 345` still fits `00-000`. A form reset is picked up once the browser restores the default value. The input carries `data-complete="true"` once every position is filled,
and fires `cx-mask:change` with `{ text, raw, complete }`.

A mask shapes what the reader types; it does not validate meaning (a date mask accepts 2026-13-40). Check the value as well,
for example with a [flow text format](flow-inputs.md#text-formats), whose `mask` stays a hint of the shape.
