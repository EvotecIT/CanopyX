  DataGrid.prototype.calculateGridAggregates=async function(columns){
      const controller=this.statusAggregateController=new AbortController(),signal=controller.signal,owner=this.dataLifetime,abort=()=>controller.abort();owner.signal.addEventListener("abort",abort,{once:true});
      setText(this.statusAggregates,this.labels.loading);
      try{
        const totals=new Map(columns.map(column=>[column.id,{count:0,sum:0,min:Infinity,max:-Infinity}]));let read=0;
        const selected=this.prepareExport({scope:"selected",columns:columns.map(column=>column.id),signal}).rows();
        for await(const row of selected){
          if(++read>50000)throw new Error(this.labels.gridUnknownCount);
          for(const column of columns){const value=cellValue(row.cells[column.id]);if(typeof value!=="number")continue;
            const total=totals.get(column.id);total.count++;total.sum+=value;total.min=Math.min(total.min,value);total.max=Math.max(total.max,value);}
        }
        if(signal.aborted||this.destroyed)return;this.statusAggregates.replaceChildren();
        for(const column of columns){const total=totals.get(column.id),item=h("span"),number={format:value=>numberText(value,this.lang,column.format)};setText(item,column.title+": "+(total.count?number.format(total.sum):"—"));
          item.title=fill(this.labels.gridSelectionAggregate,{count:total.count,sum:number.format(total.sum),average:total.count?number.format(total.sum/total.count):"—",minimum:total.count?number.format(total.min):"—",maximum:total.count?number.format(total.max):"—"});this.statusAggregates.appendChild(item);}
      }catch(error){if(!signal.aborted&&!this.destroyed)setText(this.statusAggregates,this.labels.gridNoData);}
      finally{owner.signal.removeEventListener("abort",abort);}
  };
