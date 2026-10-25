  // OfficeIMO owns document construction and capture-to-document mapping. This part only connects delivery contracts.
  const officeWrite = global.OfficeIMO.exportCanopy;
  EXPORT_IMPL.office = (capture, context) => officeWrite(capture, context.format, {
    signal: context.signal, onProgress: progress => context.progress(progress.rows)
  });
