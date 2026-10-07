  // Declarative presentations are shared by ordinary cells, reporting cells, facets and record details.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridExpandCell: "{column}: show complete text", gridCloseCell: "Close complete text"
  }));
  const GRID_PRESENTERS_BUILD = DataGrid.prototype.build;
  function gridPresenter(options, column, columns) {
    const fields = {link:["hrefColumn","newWindow"],icon:["glyph"],progress:["maximum","thresholds"],boolean:["inverted"],
      list:["separator","limit"],longText:["mono"],enum:["tones","quietTones"],state:["tones","quietTones"],change:["deltaColumn","higherIsGood"],
      statusStrip:[],sparklineBars:["thresholds","minimum","scaleMaximum","higherIsGood","mark"],
      sparklineLine:["thresholds","minimum","scaleMaximum","higherIsGood","mark"],identifier:["secondaryColumn","mono"],tags:["separator","limit"],missing:[]};
    const invalid = () => { throw new Error("CanopyX: invalid grid presenter or raw column binding."); };
    if (!options || typeof options !== "object" || Array.isArray(options) || !Object.hasOwn(fields,options.kind) ||
        Object.keys(options).some(key=>key!=="kind"&&!fields[options.kind].includes(key))) invalid();
    if (["progress","change"].includes(options.kind) && column.kind!=="number" ||
        ["boolean","list","tags","link"].includes(options.kind) && column.kind!=="text") invalid();
    for (const name of ["newWindow","inverted","mono","higherIsGood"]) if (options[name]!==undefined && typeof options[name]!=="boolean") invalid();
    for (const name of ["hrefColumn","deltaColumn","secondaryColumn"]) if (options[name]!==undefined) {
      const target=columns.find(item=>item.id===options[name]);
      if (!target || name==="hrefColumn"&&target.kind!=="text" || name==="deltaColumn"&&target.kind!=="number") invalid();
    }
    if (options.kind==="change"&&!options.deltaColumn || options.kind==="icon"&&(typeof options.glyph!=="string"||!options.glyph.trim()||options.glyph.length>32)) invalid();
    if (options.maximum!==undefined&&(!Number.isFinite(options.maximum)||options.maximum<=0||options.maximum>Number.MAX_SAFE_INTEGER)) invalid();
    if (["list","tags"].includes(options.kind) && (typeof options.separator!=="string"||!options.separator.length||options.separator.length>16||
        options.limit!==undefined&&(!Number.isInteger(options.limit)||options.limit<1||options.limit>16))) invalid();
    if ((options.minimum===undefined)!==(options.scaleMaximum===undefined)||options.minimum!==undefined&&
        (![options.minimum,options.scaleMaximum].every(value=>Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER)||options.minimum>=options.scaleMaximum)) invalid();
    if (options.mark!==undefined&&!['last','worst'].includes(options.mark)) invalid();
    if (options.quietTones!==undefined&&(!Array.isArray(options.quietTones)||options.quietTones.length>16||options.quietTones.some(tone=>typeof tone!=="string"||!/^[a-z][a-z0-9-]{0,31}$/.test(tone)))) invalid();
    if (options.tones!==undefined&&(!options.tones||typeof options.tones!=="object"||Array.isArray(options.tones)||Object.keys(options.tones).length>512||
        Object.entries(options.tones).some(([key,value])=>key.length>4096||typeof value!=="string"))) invalid();
    if (options.thresholds!==undefined&&(!Array.isArray(options.thresholds)||options.thresholds.length>32||options.thresholds.some((point,index)=>
        !point||Object.keys(point).some(key=>!["upperBound","tone"].includes(key))||!Number.isFinite(point.upperBound)||Math.abs(point.upperBound)>Number.MAX_SAFE_INTEGER||
        typeof point.tone!=="string"||index>0&&options.thresholds[index-1].upperBound>=point.upperBound))) invalid();
  }
  function gridSeries(cell) { return isCellObject(cell)&&cell.series||[]; }
  function gridSeriesValid(points) {
    return Array.isArray(points)&&points.length<=4096&&points.every(point=>point&&typeof point==="object"&&!Array.isArray(point)&&
      Object.keys(point).every(key=>["period","value","state","tone"].includes(key))&&typeof point.period==="string"&&!!point.period.trim()&&point.period.length<=256&&
      (point.value==null||Number.isFinite(point.value)&&Math.abs(point.value)<=Number.MAX_SAFE_INTEGER)&&
      (point.state==null||typeof point.state==="string"&&point.state.length<=4096)&&(point.tone===undefined||typeof point.tone==="string"));
  }
  function gridPresenterTone(options,raw,fallback) {
    if (options.tones&&Object.hasOwn(options.tones,String(raw))) return options.tones[String(raw)];
    return options.thresholds?.find(item=>typeof raw==="number"&&raw<=item.upperBound)?.tone || fallback || "neutral";
  }
  function gridPresenterLink(raw) {
    if (typeof raw!=="string"||raw.length>8192||/[\u0000-\u001f\u007f]/.test(raw)||!raw.trim()) return null;
    const value=raw.trim();
    try { const url=new URL(value,document.baseURI);
      if (["http:","https:","mailto:"].includes(url.protocol)) return url.href;
      if (url.protocol==="file:"&&!/^[a-z][a-z\d+.-]*:|^[\\/]{2}|\\/i.test(value)) return url.href;
    } catch (_) { /* Invalid destinations retain plain text. */ }
    return null;
  }
  DataGrid.prototype.build = function () {
    for (const column of this.columns) {
      const options=column.presenter || this.view.reporting?.presenters?.[column.id] || (column.wrap?{kind:"longText"}:null);
      if (options&&!column.render) column.render=gridCellRenderer(this,column,options);
    }
    return GRID_PRESENTERS_BUILD.call(this);
  };
