  let activeRecordDrawer;
  DataGrid.prototype.openGridDrawer=function(record,index,returnFocus){
    if(activeRecordDrawer?.contains(returnFocus))returnFocus=activeRecordDrawer._returnFocus;
    activeRecordDrawer?.close();
    const dialog=h("dialog","cx-host cx-grid-overlay cx-drawer"),head=h("div","cx-drawer-h"),identity=h("div"),title=h("h4"),subtitle=h("p"),body=h("div","cx-drawer-body");
    dialog._returnFocus=returnFocus;
    gridOverlayTheme(this,dialog);title.id=this.id+"-record-title";title.tabIndex=-1;title.setAttribute("aria-level","2");dialog.setAttribute("aria-labelledby",title.id);
    const previous=gridDecorateButton(gridButton("",()=>navigate(-1)),"up",true),next=gridDecorateButton(gridButton("",()=>navigate(1)),"down",true),close=gridDecorateButton(gridButton("",()=>dialog.close()),"close",true);
    previous.setAttribute("aria-label",this.labels.gridPreviousRecord);next.setAttribute("aria-label",this.labels.gridNextRecord);close.setAttribute("aria-label",this.labels.gridCloseRecord);
    for(const button of [previous,next,close])button.classList.add("icon");identity.append(title,subtitle);head.append(identity,previous,next,close);dialog.append(head,body);
    document.body.appendChild(dialog);activeRecordDrawer=dialog;this.recordDrawer=dialog;
    const primary=this.visibleColumns()[0],shape=gridResultShape(this.acceptedQuery),owner=this.dataLifetime;let retiredForNavigation=false;
    const paint=(row,position)=>{
      record=row;index=position;dialog._cxRecord=row;setText(title,cellText(row.cells[primary.id],primary,this.fmt)||row.id);
      const options=primary.presenter;
      // The subtitle is the secondary text the host configures (a cell's secondary text or the presenter's secondaryColumn), never the raw row id.
      const secondary=row.cells[primary.id]?.secondary||options?.secondaryColumn&&cellText(row.cells[options.secondaryColumn],this.columns.find(column=>column.id===options.secondaryColumn),this.fmt)||"";
      setText(subtitle,secondary);subtitle.hidden=!secondary;
      previous.disabled=index<=0||this.cursor&&index<=this.rowBounds().first;next.disabled=index>=this.rowCount()-1;
      body.replaceChildren();const sections=new Map();
      for(const column of this.columns){const name=column.section||this.labels.gridDetailsSection;
        if(!sections.has(name)){const heading=h("div","cx-drawer-s"),list=h("dl","cx-dl");setText(heading,name);sections.set(name,list);body.append(heading,list);}
        const label=h("dt"),value=h("dd"),presenter=column.presenter||(column.wrap?{kind:"longText"}:null);setText(label,column.title);
        if(presenter)gridCellRenderer(this,{...column,renderWidth:260},presenter)(row,value);else setText(value,cellText(row.cells[column.id],column,this.fmt)||"—");
        sections.get(name).append(label,value);
      }
    };
    const navigate=async direction=>{
      const position=index+direction;if(position<0||position>=this.rowCount()||this.pendingQuery)return;
      dialog._navigating=true;previous.disabled=next.disabled=true;
      try{await this.focusResult(position,false);if(this.destroyed||this.pendingQuery||gridResultShape(this.acceptedQuery)!==shape)return;
        const row=this.rowCache.get(position);if(!row)return;
        if(dialog.isConnected){paint(row.h,position);this.focusRing(title);}else if(retiredForNavigation)await this.openDetails(row.key);
      }catch(error){if(error.name!=="AbortError")this.emit("error",{error});}
      finally{dialog._navigating=false;if(dialog.isConnected)paint(record,index);}
    };
    dialog.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();dialog.close();}
      else if(["ArrowUp","ArrowDown"].includes(event.key)&&!event.target.matches('input,textarea,select,[contenteditable]')){event.preventDefault();navigate(event.key==="ArrowUp"?-1:1);}
    });
    const abort=()=>{retiredForNavigation=dialog._navigating;dialog.close();};owner.signal.addEventListener("abort",abort,{once:true});
    dialog.addEventListener("close",()=>{owner.signal.removeEventListener("abort",abort);dialog.remove();if(activeRecordDrawer===dialog)activeRecordDrawer=null;if(this.recordDrawer===dialog)this.recordDrawer=null;
      if(!this.recordDrawer&&!dialog._navigating&&!this.destroyed)gridRestoreFocus(this,returnFocus,record.id,primary);},{once:true});
    paint(record,index);const phone=this.host.clientWidth<=640;dialog.classList.toggle("cx-phone",phone);if(phone)dialog.showModal();else dialog.show();this.focusRing(title);
  };
