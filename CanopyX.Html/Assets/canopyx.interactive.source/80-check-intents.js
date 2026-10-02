
  // Checking stores paths, not node wrappers. Lazy loading, cache retirement, and sorting cannot erase an intent.
  function checkIntentPath(path) {
    if (!Array.isArray(path) || !path.length) throw new Error("CanopyX: checking needs a complete node-ID path.");
    const seen = new Set();
    return path.map(id => {
      requireIdentifier(id, "checking path ID");
      if (seen.has(id)) throw new Error("CanopyX: a checking path cannot repeat an ID.");
      seen.add(id);
      return id;
    });
  }

  function checkBranch() { return { value: null, mask: 0, children: new Map() }; }

  class CheckIntents {
    constructor(items, mode) {
      if (!Array.isArray(items)) throw new Error("CanopyX: checkIntents must be an array.");
      this.mode = mode;
      this.root = checkBranch();
      for (const item of items) {
        if (!item || typeof item.checked !== "boolean") throw new Error("CanopyX: a checking intent needs a boolean checked value.");
        const path = checkIntentPath(item.path);
        let branch = this.root;
        for (const id of path) {
          if (!branch.children.has(id)) branch.children.set(id, checkBranch());
          branch = branch.children.get(id);
        }
        if (branch.value !== null) throw new Error("CanopyX: a checking path cannot have duplicate intents.");
        branch.value = item.checked;
      }
      // Iterative traversal supports deep paths without relying on the browser's call-stack depth.
      const pending = [{ branch: this.root, inherited: false, visited: false }];
      while (pending.length) {
        const frame = pending.pop(), branch = frame.branch;
        if (frame.visited) {
          branch.mask = branch.value === null ? 0 : branch.value ? 1 : 2;
          for (const child of branch.children.values()) branch.mask |= child.mask;
          continue;
        }
        if (mode === "hierarchical" && branch.value === frame.inherited) branch.value = null;
        const inherited = branch.value === null ? frame.inherited : branch.value;
        pending.push({ branch, inherited, visited: true });
        for (const child of branch.children.values()) pending.push({ branch: child, inherited, visited: false });
      }
    }

    snapshot() {
      const result = [], pending = [{ branch: this.root, path: [] }];
      while (pending.length) {
        const { branch, path } = pending.pop();
        if (branch.value !== null) result.push({ path, checked: branch.value });
        const children = Array.from(branch.children).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        for (let i = children.length - 1; i >= 0; i--) pending.push({ branch: children[i][1], path: path.concat(children[i][0]) });
      }
      return result;
    }

    state(path) {
      let branch = this.root, checked = false;
      for (const id of path) {
        branch = branch && branch.children.get(id);
        if (branch && branch.value !== null && this.mode === "hierarchical") checked = branch.value;
      }
      if (this.mode === "independent") return !!branch && branch.value === true;
      return branch && (branch.mask & (checked ? 2 : 1)) ? "mixed" : checked;
    }

    with(path, checked) {
      const samePrefix = rule => path.every((id, index) => rule.path[index] === id);
      const items = this.snapshot().filter(rule => !(samePrefix(rule) && (this.mode === "hierarchical" || rule.path.length === path.length)));
      items.push({ path: path.slice(), checked });
      return new CheckIntents(items, this.mode);
    }
  }
