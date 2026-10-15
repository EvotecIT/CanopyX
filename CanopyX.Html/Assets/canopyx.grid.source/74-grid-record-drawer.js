  // ---------- the record drawer ----------
  // One drawer per page. Its head names the record (the identity column's text and secondary text) with previous/next over
  // the accepted result and Close; the body lists the record's fields by section, each with its presenter, host or plugin
  // renderer, or its text with tone, tooltip and badges. A column with drawer: false stays out of it. The record panel part
  // (canopyx.record-panel.source) generalises this drawer: it opens records outside the loaded rows (index null) and paints a
  // structured body. Parts that extend the drawer rely on this contract:
  //  - paintDrawerBody(row, body, dialog, context) paints the body for every record shown (the record panel part paints it when
  //    the view or record needs it), and the part decorates the head once it is built (RECORD_IMPL.decorate);
  //  - every field's <dt> and <dd> carry data-cx-field (the column or record field id); the dialog carries data-cx-record and
  //    data-cx-view, dialog._cxRecord is the raw record shown, and drawerFields(dialog) lists the painted fields in order;
  //  - after each paint the dialog dispatches "cx-drawer-paint" with { id, index }.
  let activeRecordDrawer;
  DataGrid.prototype.openGridDrawer=function(record,index,returnFocus,options){
    if(activeRecordDrawer?.contains(returnFocus))returnFocus=activeRecordDrawer._returnFocus;
    // A drawer opened in place of another takes its focus: the one it replaces does not restore focus on closing.
    // It leaves the page at once, so the page never holds two drawers (or two titles with one id); its close event still runs.
    if(activeRecordDrawer){activeRecordDrawer._replaced=true;activeRecordDrawer.close();activeRecordDrawer.remove();}
    const dialog=h("dialog","cx-host cx-grid-overlay cx-drawer"),head=h("div","cx-drawer-h"),identity=h("div"),title=h("h4"),subtitle=h("p"),body=h("div","cx-drawer-body");
    dialog._returnFocus=returnFocus;
    gridOverlayTheme(this,dialog);title.id=this.id+"-record-title";title.tabIndex=-1;title.setAttribute("aria-level","2");dialog.setAttribute("aria-labelledby",title.id);
    const previous=gridDecorateButton(gridButton("",()=>navigate(-1)),"up",true),next=gridDecorateButton(gridButton("",()=>navigate(1)),"down",true),close=gridDecorateButton(gridButton("",()=>dialog.close()),"close",true);
    previous.setAttribute("aria-label",this.labels.gridPreviousRecord);next.setAttribute("aria-label",this.labels.gridNextRecord);close.setAttribute("aria-label",this.labels.gridCloseRecord);
    for(const button of [previous,next,close])button.classList.add("icon");identity.append(title,subtitle);head.append(identity,previous,next,close);dialog.append(head,body);
    document.body.appendChild(dialog);activeRecordDrawer=dialog;this.recordDrawer=dialog;
    const primary=this.visibleColumns()[0],shape=gridResultShape(this.acceptedQuery),owner=this.dataLifetime;let retiredForNavigation=false,paints=null;
    // A record outside the accepted result (a deep link or a related record) has no position: previous and next stay off.
    const placed=()=>Number.isInteger(index);
    const steps=()=>{previous.disabled=!placed()||index<=0||this.cursor&&index<=this.rowBounds().first;next.disabled=!placed()||index>=this.rowCount()-1;};
    const paint=(row,position)=>{
      record=row;index=position;paints?.abort();paints=new AbortController();setText(title,cellText(row.cells[primary.id],primary,this.fmt)||row.id);
      const options=primary.presenter;
      // The subtitle is the secondary text the host configures (a cell's secondary text or the presenter's secondaryColumn), never the raw row id.
      const secondary=row.cells[primary.id]?.secondary||options?.secondaryColumn&&cellText(row.cells[options.secondaryColumn],this.columns.find(column=>column.id===options.secondaryColumn),this.fmt)||"";
      setText(subtitle,secondary);subtitle.hidden=!secondary;
      dialog._cxRecord=row;dialog.setAttribute("data-cx-record",row.id);dialog.setAttribute("data-cx-view",this.view.id);
      steps();this.paintDrawerBody(row,body,dialog,{index,signal:paints.signal});
      dialog.dispatchEvent(new CustomEvent("cx-drawer-paint",{detail:{id:row.id,index}}));
    };
    const navigate=async direction=>{
      const position=index+direction;if(!placed()||position<0||position>=this.rowCount()||this.pendingQuery)return;
      dialog._navigating=true;previous.disabled=next.disabled=true;
      try{await this.focusResult(position,false);if(this.destroyed||this.pendingQuery||gridResultShape(this.acceptedQuery)!==shape)return;
        const row=this.rowCache.get(position);if(!row)return;
        if(dialog.isConnected){paint(row.h,position);title.focus({preventScroll:true});}else if(retiredForNavigation)await this.openDetails(row.key);
      }catch(error){if(error.name!=="AbortError")this.emit("error",{error});}
      // The record shown stays (it was painted on arrival, or the move failed); only the step buttons follow.
      finally{dialog._navigating=false;if(dialog.isConnected)steps();}
    };
    dialog._cxPaint=paint;
    dialog.addEventListener("keydown",event=>{
      if(event.key==="Escape"&&!event.defaultPrevented){event.preventDefault();dialog.close();}
      else if(["ArrowUp","ArrowDown"].includes(event.key)&&!event.defaultPrevented&&!event.target.matches('input,textarea,select,[contenteditable],[role=tab]')&&!event.target.closest(".cx-record-nested")){event.preventDefault();navigate(event.key==="ArrowUp"?-1:1);}
    });
    const abort=()=>{retiredForNavigation=dialog._navigating;dialog.close();};owner.signal.addEventListener("abort",abort,{once:true});
    dialog.addEventListener("close",()=>{owner.signal.removeEventListener("abort",abort);paints?.abort();dialog.remove();if(activeRecordDrawer===dialog)activeRecordDrawer=null;if(this.recordDrawer===dialog)this.recordDrawer=null;
      if(!this.recordDrawer&&!dialog._navigating&&!dialog._replaced&&!this.destroyed)gridRestoreFocus(this,returnFocus,record.id,primary);},{once:true});
    RECORD_IMPL.decorate?.(this,dialog,{head,identity,title,subtitle,body,options:options||{}});
    paint(record,index);const phone=this.host.clientWidth<=640;dialog.classList.toggle("cx-phone",phone);if(phone)dialog.showModal();else dialog.show();title.focus({preventScroll:true});
    return dialog;
  };
  Object.assign(DataGrid.prototype,{
    // The plain body: the declared columns by section, in column order.
    paintDrawerBody(row,body,dialog,context){
      if(RECORD_IMPL.paint&&this.recordNeeded(row))return RECORD_IMPL.paint(this,row,body,dialog,context);
      body.replaceChildren();const sections=new Map();
      for(const column of this.columns){
        if(column.drawer===false)continue;
        const name=column.section||this.labels.gridDetailsSection;
        if(!sections.has(name)){const heading=h("div","cx-drawer-s"),list=h("dl","cx-dl");setText(heading,name);sections.set(name,list);body.append(heading,list);}
        const label=h("dt"),value=h("dd");setText(label,column.title);label.setAttribute("data-cx-field",column.id);value.setAttribute("data-cx-field",column.id);
        this.paintDrawerValue(column,row,value,context);sections.get(name).append(label,value);
      }
    },
    // A field keeps what its cell shows: a host or plugin renderer, a presenter, or its text with tone, tooltip and badges.
    paintDrawerValue(column,row,value,context){
      const cell=row.cells[column.id],object=isCellObject(cell),presenter=column.presenter||(column.wrap?{kind:"longText"}:null);
      if(column.render&&column.hostRenderer!==false){
        try{if(column.render(row,value,{column:column.id,index:this.columns.indexOf(column),signal:context.signal,onDispose:cleanup=>context.signal.addEventListener("abort",cleanup,{once:true})})===true)return;}
        catch(error){this.emit("error",{error});}
      }
      if(presenter){gridCellRenderer(this,{...column,renderWidth:context.width||260},presenter)(row,value);return;}
      const text=cellText(cell,column,this.fmt),span=h("span");applyTone(span,"cx-drawer-text"+(text?"":" p-missing"),toneOf(object?cell.tone:null));
      setText(span,text||"—");if(object&&cell.title)span.title=cell.title;value.appendChild(span);
      if(object)for(const badge of cell.badges||[])value.appendChild(badgeElement(badge));
    },
    /** The fields the open drawer shows, in order: { id, column (null for a record field), term, value }. */
    drawerFields(dialog=this.recordDrawer){
      return dialog?[...dialog.querySelectorAll("dd[data-cx-field],.cx-record-block-b[data-cx-field]")].filter(value=>value.closest(".cx-drawer")===dialog).map(value=>{const id=value.getAttribute("data-cx-field");
        return {id,column:this.columns.find(column=>column.id===id)||null,term:value.previousElementSibling,value};}):[];
    }
  });
