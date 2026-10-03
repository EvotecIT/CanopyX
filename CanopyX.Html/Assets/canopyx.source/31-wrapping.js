  // ---------- tree grid: iterative construction and initial expansion ----------
  // Snapshot visible payloads so an inline host's in-place edits are detected without serializing whole subtrees.
  function nodeContent(node) {
    return JSON.stringify([node.label, node.kind, node.icon, node.cells, node.badges, node.flags, node.detail, node.data]);
  }
  Object.assign(TreeGrid.prototype, {
    /** Loads lazy children of nodes that start expanded without recursive tree walks. */
    async expandInitial(parent) {
      if (this.restoring) return;
      const generation = this.restoreGeneration || 0;
      const pending = (parent.children || []).slice().reverse();
      while (pending.length && !this.destroyed && !this.restoring && generation === (this.restoreGeneration || 0)) {
        const w = pending.pop();
        if (w.autoExpand && !w.children) {
          w.autoExpand = false;
          await this.toggle(w, true, true);
        }
        if (w.expanded && w.children) {
          for (let i = w.children.length - 1; i >= 0; i--) pending.push(w.children[i]);
        }
      }
    },

    createWrapper(data, owner, position) {
        requireIdentifier(data.id, "node ID");
        if (data.ref != null) requireIdentifier(data.ref, "node reference");
        const w = {
          key: data.id, h: data, parent: owner, level: owner.level + 1, idx: position, expanded: false,
          children: null, total: null, next: null, inline: false, loading: false, error: null,
          hpx: data.detail ? this.detailHeight(data.detail) : this.rowH, auto: !!data.detail && !(data.detail.height > 0), _v: 0,
          content: nodeContent(data)
        };
        this.keyMap.set(data.id, w);
        return w;
    },

    wrap(node, parent, index, suppressExpansion) {
      const initialExpansion = !suppressExpansion && !this.restoring;
      const root = this.createWrapper(node, parent, index);
      const pending = [root];
      while (pending.length) {
        const w = pending.pop();
        const data = w.h;
        if (Array.isArray(data.children)) {
          w.inline = true;
          const first = this.inlinePage(w, null);
          w.children = first.items.map((child, i) => this.createWrapper(child, w, first.positions[i]));
          w.total = first.total;
          w.next = first.next;
          w.expanded = !!data.expanded && initialExpansion && w.children.length > 0;
          for (let i = w.children.length - 1; i >= 0; i--) pending.push(w.children[i]);
          this.applySort(w, false);
          this.rememberInactive(w);
        } else if (data.hasChildren) {
          w.total = typeof data.childCount === "number" ? data.childCount : null;
          w.autoExpand = !!data.expanded && initialExpansion;
        }
      }
      return root;
    }
  });
