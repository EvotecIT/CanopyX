# OfficeIMO browser document writers

`officeimo-canopyx.js` is the unmodified standalone CanopyX integration from `@evotecit/officeimo` 0.1.2, published under the MIT license. `LICENSE` preserves its license and copyright notice.

The source is [the published npm archive](https://registry.npmjs.org/@evotecit/officeimo/-/officeimo-0.1.2.tgz), file `package/bundles/officeimo-canopyx.js`. The archive integrity is `sha512-91ZLw30Ib8GW7IEu/WxzKW+zHU+gkVzoMZKgIJruPclcCH9lRQYjG/YNMTOoHH+E6WRnmuRnJ1iMiu+IVXR+NA==`.

The asset assembler includes this source only in the optional `office-export` part. Base runtime files contain the format descriptors and lazy loader, without the document engines. An offline page embeds the inert part only when its view declares XLSX or PDF.

Document-engine changes belong in OfficeIMO. Refresh this source from a published package after validating the archive integrity, preserve the license, regenerate assets, and run actual XLSX/PDF consumer checks. Do not patch the copied bundle.
