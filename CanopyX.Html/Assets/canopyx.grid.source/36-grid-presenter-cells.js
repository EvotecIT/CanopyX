  function gridRenderPresenter(grid,column,options,record,complete) {
    return (row,element) => {
      const cell=row.cells[column.id],raw=cellValue(cell),text=cellText(cell,column,grid.fmt),object=isCellObject(cell);
      const rule=columnNumericTone(column,raw),declaredTone=columnValueTone(column,cell),tone=declaredTone||gridPresenterTone(options,raw,object?cell.tone:null);
      element.classList.add("cx-presented-cell"); if (rule || object&&cell.title) element.title=rule?.label || cell.title;
      if(declaredTone)applyTone(element,element.className,toneOf(declaredTone));
      if(rule)element.setAttribute("aria-description",rule.label);
      const add=(value,cls="cx-presenter-text",tag="span")=>{
        const item=h(tag,cls),textItem=/^(cx-presenter-text|p-mono|p-link|cx-wrapped-text|p-muted)\b/.test(cls);setText(item,value);
        if(declaredTone&&textItem)item.style.color="inherit";
        if(column.wrap&&textItem){
          item.classList.add("cx-wrapped-text");item.style.maxWidth="100%";item.style.flex="none";item.title=rule?.label||String(value);
          // Grid values read in full in the drawer; record-only fields retain their own authored line limit.
          if(complete){item.style.webkitLineClamp="unset";item.style.maxHeight="none";}
          else {
            const lines=record?column.maxLines??2:grid.layoutMode==="cards"?Math.min(column.maxLines??2,2):grid.autoRows?column.maxLines??2:1;
            item.style.webkitLineClamp=String(lines);item.style.maxHeight=lines*1.4+"em";
          }
        }
        element.appendChild(item);return item;
      };
      const more=(value,label=grid.labels.gridShowMore)=>{
        const button=add(label,"cx-link cx-presenter-expand","button");button.type="button";
        button.setAttribute("aria-haspopup","dialog");button.setAttribute("aria-label",label+", "+fill(grid.labels.gridExpandCell,{column:column.title}));
        button.addEventListener("click",()=>grid.showReportingText(column,value,button,row.id,options.mono));return button;
      };
      if (GRID_CHART_CELL_KINDS.includes(options.kind)) {
        if (GRID_CHART_CELLS.render) GRID_CHART_CELLS.render(grid,column,options,cell,element,text);
        else { add(text); grid.loadChartCells(); }
      } else if (GRID_HISTORY_KINDS.includes(options.kind)) {
        if(GRID_HISTORY_IMPL.render)GRID_HISTORY_IMPL.render(grid,column,options,cell,element,text);else grid.loadHistory();
      } else if (GRID_ACTIVITY_KINDS.includes(options.kind)) {
        // Relative times and logs paint through the activity part (36-grid-presenter-activity.js).
        if(GRID_ACTIVITY.render)GRID_ACTIVITY.render(grid,column,options,row,cell,element,text,add,record||complete);else{add(text);grid.loadActivity();}
      } else if (options.kind==="structured") {
        // Lists, objects and collections summarise through the record panel part (52-grid-record-part.js).
        if(RECORD_IMPL.summary)RECORD_IMPL.summary(grid,column,options,row,element,text);else{add(text);grid.loadRecordPanel();}
      } else if (options.kind==="change" && options.beforeAfter && object && cell.changes?.length) {
        const change=cell.changes[0], wrap=h("span","cx-before-after"), before=h("del"), arrow=h("span"), after=h("ins");
        const kind={...column,kind:change.kind||column.kind};
        setText(before,changeCellText(change.before,kind,grid.fmt));setText(arrow,"→");arrow.setAttribute("aria-hidden","true");
        setText(after,changeCellText(change.after,kind,grid.fmt));
        if(grid.view.compare && cellValue(row.cells[grid.view.compare.statusColumn])==="removed")wrap.append(before);
        else wrap.append(before,arrow,after);
        element.append(wrap);
      } else if (raw==null&&object&&cell.text==="") add("");
      else if (raw==null&&(!object||cell.text===undefined)||text==="") add("—","p-missing");
      else if (options.kind==="link") {
        const href=gridPresenterLink(cellValue(options.hrefColumn?row.cells[options.hrefColumn]:cell));
        const link=add(text,"p-link",href?"a":"span"); if(href){link.href=href;if(options.newWindow){link.target="_blank";link.rel="noopener noreferrer";}}
      } else if(options.kind==="icon") {add(options.glyph,"cx-presenter-icon").setAttribute("aria-hidden","true");add(text);}
      else if(options.kind==="boolean"&&typeof raw==="boolean") {
        const value=add(raw?"":"—",raw?"p-bool-yes"+(options.inverted?" cx-bool-bad":""):"p-bool-no");
        value.setAttribute("role","img");value.setAttribute("aria-label",raw?grid.labels.yes:grid.labels.no);
        if(raw)value.appendChild(gridIcon("check"));
      } else if(options.kind==="state"||options.kind==="enum") {
        // Quiet values are plain text (muted unless quietStyle is "plain"); in an enum they keep the pills' inline start.
        if(options.quietTones?.includes(tone)) add(text,(options.quietStyle==="plain"?"cx-presenter-text":"p-muted")+(options.kind==="enum"?" p-inset":""));
        else if(options.kind==="state") {
          // A dot (or the value's glyph) before the text, which carries the meaning; style "pill" sets both in a tone pill.
          const pill=options.style==="pill",glyph=Object.hasOwn(options.icons||{},String(raw))&&options.icons[String(raw)];
          const state=add("",pill?"p-pill p-status":"p-state"+(tone==="success"?" quiet":"")),mark=h("span",glyph?"p-glyph":"p-dot "+(pill?"":tone==="success"?"quiet":tone));
          if(pill)applyTone(state,"p-pill p-status "+tone,toneOf(tone));else if(glyph)applyTone(mark,"p-glyph",toneOf(tone));else toneColors(mark,toneOf(tone));
          if(glyph)setText(mark,glyph);mark.setAttribute("aria-hidden","true");state.append(mark,document.createTextNode(text));
        } else {const pill=add(text,"p-pill "+tone);applyTone(pill,pill.className,toneOf(tone));}
      } else if(options.kind==="change") {
        const delta=cellValue(row.cells[options.deltaColumn]);
        if(typeof delta==="number")add((delta===0?"":delta>0?"↑ ":"↓ ")+numberFormat(grid.lang).format(Math.abs(delta)),
          "p-delta "+(delta===0?"flat":(delta>0)===!!options.higherIsGood?"good":"bad"));
        add(text);
      } else if(options.kind==="progress"&&typeof raw==="number") {
        const box=add("","p-progress"),track=h("span","track"),bar=h("span","fill "+tone),maximum=options.maximum||100;
        track.setAttribute("role","progressbar");track.setAttribute("aria-label",column.title);track.setAttribute("aria-valuemin","0");
        track.setAttribute("aria-valuemax",String(maximum));track.setAttribute("aria-valuenow",String(Math.min(maximum,Math.max(0,raw))));track.setAttribute("aria-valuetext",text);
        bar.style.width=Math.min(100,Math.max(0,raw/maximum*100))+"%";toneColors(bar,toneOf(tone));track.appendChild(bar);box.append(track,document.createTextNode(text));
      } else if(options.kind==="rating"&&typeof raw==="number") {
        // Whole stars for the value, empty ones to the maximum; the picture reads as the value out of the maximum.
        const maximum=options.maximum,filled=Math.round(Math.min(maximum,Math.max(0,raw))),stars=add("","p-rating"),on=h("span","on"),off=h("span","off");
        stars.setAttribute("role","img");stars.setAttribute("aria-label",numberFormat(grid.lang,0,2).format(raw)+" / "+numberFormat(grid.lang).format(maximum));
        setText(on,"★".repeat(filled));setText(off,"☆".repeat(maximum-filled));stars.append(on,off);
      } else if(options.kind==="identifier") {
        const secondary=options.secondaryColumn?cellText(row.cells[options.secondaryColumn],grid.columns.find(item=>item.id===options.secondaryColumn),grid.fmt):object&&cell.secondary;
        // The drawer, and two-line rows of a column that asks with stack, put the secondary text under the value.
        const stack=secondary&&(record||options.stack&&(complete||grid.autoRows))&&add("","p-stack");
        for(const item of [add(text,options.mono?"p-mono":"cx-presenter-text"),secondary&&add(secondary,"p-sub")])if(item&&stack)stack.appendChild(item);
      } else if(options.kind==="tags"||options.kind==="list") {
        const values=text.split(options.separator).map(item=>item.trim()).filter(Boolean),limit=options.kind==="tags"?3:options.limit||3;
        const preview=add("","cx-tag-list");element.classList.add("cx-list-cell");
        const shown=record||complete||column.wrap||grid.layoutMode==="cards"?Math.min(limit,values.length):gridTagsThatFit(grid,column,values.slice(0,limit),values.length,options.kind==="list");
        for(const value of values.slice(0,shown)){const tag=h("span","p-tag");setText(tag,value);preview.appendChild(tag);}
        if(values.length>shown||options.kind==="list")more(text,values.length>shown?"+"+(values.length-shown):grid.labels.gridShowMore);
      } else if(options.kind==="longText") {
        if(column.wrap){
          add(text,"cx-wrapped-text"+(options.mono?" p-mono":""));
        }else{
        const budget=Math.max(256,Math.ceil((column.renderWidth||column.width)/7*5));
        const preview=add(text.length>budget?text.slice(0,budget).replace(/[\uD800-\uDBFF]$/,"")+" …":text,"cx-wrapped-text"+(options.mono?" p-mono":""));
        if(!grid.autoRows)element.classList.add("cx-fixed-text");
        if(!column.wrap||text.length>Math.max(40,(column.renderWidth||column.width)/7*4)||text.split("\n").length>4){element.classList.add("cx-clamped");more(text);}
        }
      } else add(text);
      if(object)for(const badge of cell.badges||[])element.appendChild(badgeElement(badge));
      return true;
    };
  }
  // How many whole chips fit the column beside the "+N" control, measured on a canvas in the chip and cell fonts.
  // The first chip always shows; when its text alone is too wide, it ends with an ellipsis (canopyx.css).
  function gridTagsThatFit(grid,column,values,total,list) {
    if(!values.length||!grid.grid.isConnected)return values.length;
    let fonts=grid.fitTagFonts;
    if(!fonts||fonts.key!==grid.fitFont){const chip={},control={};fonts=grid.fitTagFonts={key:grid.fitFont,chip:gridClassFont(grid.grid,"p-tag",chip),control:gridClassFont(grid.grid,"cx-presenter-expand",control),extra:chip.extra,min:control.extra};}
    const context=grid.fitTagContext||=document.createElement("canvas").getContext("2d");
    if(!context)return values.length;
    const reserve=label=>{context.font=fonts.control;return Math.max(fonts.min,gridMeasureText(context,label))+6;};
    let room=(column.renderWidth||column.width)-2*(grid.fitFont?.[3]??12)-1,shown=0;
    for(const value of values){
      context.font=fonts.chip;
      const chip=gridMeasureText(context,value)+fonts.extra+4,rest=total-shown-1;
      if(shown&&chip+(rest>0?reserve("+"+rest):list?reserve(grid.labels.gridShowMore):0)>room)break;
      room-=chip;shown++;
    }
    return shown;
  }
