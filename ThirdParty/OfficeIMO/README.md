# OfficeIMO browser document writers

These files are unmodified bundles from OfficeIMO.JavaScript (`@evotecit/officeimo`), published under the MIT license. `LICENSE` preserves its license and copyright notice.

They come from [EvotecIT/OfficeIMO](https://github.com/EvotecIT/OfficeIMO) commit `2255c5d5b3c373fe899a40b9fa585338c4161300`, folder `OfficeIMO.JavaScript/bundles`. That commit has not been published to npm yet; it is the first one with the shared writer core and the thin CanopyX adapter.

| File | SHA-256 |
| --- | --- |
| `officeimo.js` | `005cc5998188f5b5b7e5820f63ef2e30ef1b8b31544214d52eba7400fce3c34c` |
| `officeimo.min.js` | `9dc32eb32be5657cc0b9075fcc852cb87832a8ff2d9579053f412771e3af6713` |
| `officeimo-canopyx-adapter.js` | `26fafde77c0961d0309ca1a74cd5ec347854efe2f63d549355eb5f10050464c1` |
| `officeimo-canopyx-adapter.min.js` | `0c7c780747ccf7d1d239051dddc7af4a40f38c6056fb501a1d74130254a7d47e` |
| `officeimo-csv.js` | `24fc01b72fe7c02a03447462c25d52f532a96e523eae795268e2c2bdb09a4eca` |
| `officeimo-csv.min.js` | `24ab84682e9fe2fba65eef7b9d56e8ca9bf6ed0f900c3c66af1995b3efbfef90` |

The asset assembler (`Build/Sync-Assets.ps1`, driven by `Build/parts.json`) builds two optional parts from the minified files. The readable files are the same build for reading and debugging; nothing ships them.

- `office-export` is `officeimo.min.js` (every writer) followed by `officeimo-canopyx-adapter.min.js` and the CanopyX bridge. It writes XLSX and PDF. An offline page embeds it only when its view declares XLSX or PDF.
- `csv-export` is `officeimo-csv.min.js` and the CanopyX bridge. It writes the built-in CSV download and `toCsv`.

Both bundles register their modules in OfficeIMO's shared module cache under keys hashed from the build, so a page that loads both parts runs each shared module once. The adapter refuses a core from another build.

Base runtime files contain the format descriptors and lazy loaders, without the document engines.

Document-engine changes belong in OfficeIMO. To refresh, take the bundles from one OfficeIMO commit or npm release, replace all six files together, update the commit and hashes above (`CanopyX.Tests` checks them), preserve the license, run `Build/Sync-Assets.ps1`, and run the export tests (`tests/browser` office and CSV specs, `tests/exports`). Do not patch the copied bundles.

The writer preserves the frozen pivot projection for XLSX and PDF, including hierarchical row and column outlines, totals, numeric formats and repeated print context. CanopyX passes its accepted `prepareExport({ pivot: true })` capture without regrouping or recalculating the values. The export menu uses that pivot capture while the pivot view is active.

OfficeIMO owns PDF width measurement, wrapping and horizontal pagination. The bridge reports the explicit text fallback for PDF-native workbook rules and leaves other unsupported presentation as an error. XLSX retains the captured width and wrapping policy.

OfficeIMO owns CSV quoting, line endings and formula protection. The CanopyX bridge indents a tree's first column by level and additionally protects full-width formula markers (＝ ＋ － ＠) and markers after non-ASCII leading white space, which OfficeIMO's ASCII rule leaves alone.
