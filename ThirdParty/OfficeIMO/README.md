# OfficeIMO browser document writers

`officeimo-canopyx.js` is the unmodified standalone CanopyX integration from `@evotecit/officeimo` 0.1.5, published under the MIT license. `LICENSE` preserves its license and copyright notice.

The source is [the published npm archive](https://registry.npmjs.org/@evotecit/officeimo/-/officeimo-0.1.5.tgz), file `package/bundles/officeimo-canopyx.js`. The archive integrity is `sha512-R+bQIufsbo9gv8W0/2e+PyUBzzxRQxtrp9v2Wp60fqLw3+8tqO9KsE+9p5023iMOBSdrMhatXswR2BKqf8wicA==`.

The asset assembler includes this source only in the optional `office-export` part. Base runtime files contain the format descriptors and lazy loader, without the document engines. An offline page embeds the inert part only when its view declares XLSX or PDF.

Document-engine changes belong in OfficeIMO. Refresh this source from a published package after validating the archive integrity, preserve the license, regenerate assets, and run actual XLSX/PDF consumer checks. Do not patch the copied bundle.

The writer preserves the frozen pivot projection for XLSX and PDF, including hierarchical row and column outlines, totals, numeric formats and repeated print context. CanopyX passes its accepted `prepareExport({ pivot: true })` capture without regrouping or recalculating the values. The export menu uses that pivot capture while the pivot view is active.

OfficeIMO owns PDF width measurement, wrapping and horizontal pagination. The bridge reports the explicit text fallback for PDF-native workbook rules and leaves other unsupported presentation as an error. XLSX retains the captured width and wrapping policy.
