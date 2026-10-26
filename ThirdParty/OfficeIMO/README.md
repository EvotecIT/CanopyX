# OfficeIMO browser document writers

`officeimo-canopyx.js` is the unmodified standalone CanopyX integration from `@evotecit/officeimo` 0.1.3, published under the MIT license. `LICENSE` preserves its license and copyright notice.

The source is [the published npm archive](https://registry.npmjs.org/@evotecit/officeimo/-/officeimo-0.1.3.tgz), file `package/bundles/officeimo-canopyx.js`. The archive integrity is `sha512-zYFbU9P/9svr5Jp8dpu3EJZradQ5nipk/+JC9OlI10oxaDS88eNfK9ZVAvdhnI8Y+hoT9FTlc2eUL3u7zW7OXA==`.

The asset assembler includes this source only in the optional `office-export` part. Base runtime files contain the format descriptors and lazy loader, without the document engines. An offline page embeds the inert part only when its view declares XLSX or PDF.

Document-engine changes belong in OfficeIMO. Refresh this source from a published package after validating the archive integrity, preserve the license, regenerate assets, and run actual XLSX/PDF consumer checks. Do not patch the copied bundle.
