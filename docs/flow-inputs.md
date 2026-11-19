# Flow input formats and signatures

Two kinds of answers that configuration and consent pages ask for, and that used to need input-mask and signature libraries:
text in a known shape (an IP address, a MAC address, a GUID, a phone number, a date written as text) and a signature. Both are
[flow fields](flow.md#fields), checked in the browser and again by `CanopyFlowSubmission` on the server.

## Text formats

A text field's `validation.format` names the shape its answer must have. The hint under the label shows an example, the input
stops spell-checking and auto-capitalising, and an answer of the wrong shape says what it should look like.

```csharp
flow.Step("device", "Which device?", step => step
    .Text("mac", "MAC address", f => f.Required().Format(CanopyFlowTextFormat.Mac))
    .Text("address", "Management address", f => f.Format(CanopyFlowTextFormat.IpAddress))
    .Text("asset", "Asset tag", f => f.Pattern("[A-Z]{3}-[0-9]{4}").Mask("AAA-0000")));
```

```json
{ "id": "mac", "type": "text", "label": "MAC address", "required": true, "validation": { "format": "mac" } }
```

| `format` | Accepts | Example in the hint |
| --- | --- | --- |
| `ipv4` | Four decimal octets, no leading zeros | 192.168.1.10 |
| `ipv6` | Any IPv6 form, including `::` and an embedded IPv4 tail | 2001:db8::1 |
| `ip` | Either of them | 192.168.1.10 |
| `cidr` | An IPv4 or IPv6 address and a prefix length | 10.0.0.0/24 |
| `mac` | Six hex pairs with `:` or `-`, or three groups of four with `.` | 00:1A:2B:3C:4D:5E |
| `guid` | 32 hex digits in 8-4-4-4-12 groups, with or without braces | 3f2504e0-4f89-11d3-9a0c-0305e82c3301 |
| `phone` | Digits, spaces, `-`, `.`, `(` and `)` with an optional leading `+`; 6 to 15 digits | +1 555 0100 |
| `date` | A real date written `yyyy-MM-dd` | 2026-11-19 |
| `time` | `HH:mm` or `HH:mm:ss`, 24-hour | 14:30 |
| `dateTime` | A date and a time separated by a space or `T`, no zone | 2026-11-19 14:30 |
| `email`, `host`, `url` | As the list field's item rules | name@example.com |

Formats check the answer; they never rewrite it, so the host gets exactly what the reader typed (trim or normalise it on the
server if a system needs one spelling). For a picker, use the `date`, `time` and `datetime` field types instead; the text
formats suit hosts that store dates and times as text.

A custom shape is a `pattern` (the whole answer must match, as in grid editing) with a `mask`: a short hint of up to 64
characters, shown under the label as "Format: AAA-0000". The mask is a hint only. It does not insert separators or limit
keystrokes. `message` replaces the default message for any failed check.

The shared cases in `tests/fixtures/flow-formats.json` run in the browser and on the server, so both accept and refuse the
same answers. The labels are `flowFormatExample`, `flowFormatInvalid` and `flowFormatMask`.

## Signatures

A signature field asks the reader to sign: with a mouse, pen or finger on a pad, or by typing their name.

```csharp
flow.Step("consent", "Sign the change request", step => step
    .Signature("signature", "Signature", f => f.Required().Help("Sign as the change owner.")));
```

```json
{ "id": "signature", "type": "signature", "label": "Signature", "required": true }
```

- **Drawing.** Pointer events draw strokes, smoothed into curves through the midpoints of the sampled points (coalesced
  events keep fast pen strokes smooth). Undo removes the last stroke and Clear removes the signature.
- **Typing.** "Type instead" switches to a text box, so a reader who cannot draw, or uses only the keyboard, signs with their
  name; the answer renders it in a script face. "Draw instead" switches back.
- **The answer** is `{ "svg": "<svg …>", "png": "data:image/png;base64,…" }`: the same picture in black ink on a transparent
  background, as an SVG document and as a PNG at twice the pad's size. Store whichever your system needs; the server checks
  that both are there, in that form, and together under 1,000,000 characters. The review page says "Signed".
- **Edit mode.** A stored signature (in `initial`) shows on the pad until the reader clears it or signs again.
- A signature field has no default and no command parameter. It ships in the lazy `flow-signature` part, which loads only
  for flows that have one.

The labels are `flowSignaturePad`, `flowSignatureUndo`, `flowSignatureClear`, `flowSignatureType`, `flowSignatureDraw`,
`flowSignatureTyped` and `flowSigned`.
