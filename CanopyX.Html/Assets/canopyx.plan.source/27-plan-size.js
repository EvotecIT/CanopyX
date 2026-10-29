  // The authored height stays the viewport bound; auto-fit only lowers its maximum for short results.
  Object.assign(DataGrid.prototype, {
    planFitHeight(content) {
      if(this.view.autoHeight===false||!this.host.isConnected)return;
      const style=this.host.style;
      if(!this.planFit) {
        const own=this.fitInline!==undefined?this.fitMax:getComputedStyle(this.host).maxHeight;
        this.planFit={inline:this.fitInline??style.maxHeight,bound:typeof own==="number"?own:own==="none"?Infinity:/^[\d.]+px$/.test(own)?parseFloat(own):own};
      }
      const inflow=(parent,omit)=>[...parent.children].filter(child=>child!==omit).reduce((sum,child)=>{
        const css=getComputedStyle(child);return ["absolute","fixed"].includes(css.position)?sum:sum+child.getBoundingClientRect().height;
      },0);
      const css=getComputedStyle(this.host),border=["paddingTop","paddingBottom","borderTopWidth","borderBottomWidth"].reduce((sum,key)=>sum+(parseFloat(css[key])||0),0);
      const height=Math.ceil(border+inflow(this.host,this.calRoot)+inflow(this.calRoot,this.calBody)+content),bound=this.planFit.bound;
      const value=typeof bound==="number"?Math.min(bound,height)+"px":"min("+height+"px, "+bound+")";
      this.planFit.written=value;if(style.maxHeight!==value)style.maxHeight=value;
    }
  });
