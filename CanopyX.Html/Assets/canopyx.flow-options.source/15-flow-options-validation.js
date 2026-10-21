  // Host sections supply part of the form's definition, including fields on steps not visited yet. Load those definitions
  // before owning a navigation/submission operation; adding their answers then cannot retire that operation mid-validation.
  const { next: flowOptionsNext, submit: flowOptionsSubmit, validateStep: flowOptionsValidate } = FlowView.prototype;
  Object.assign(FlowView.prototype, {
    async sectionPrerequisites(steps) {
      const generation = this.generation, errors = [];
      for (const step of steps) if (this.stepVisible(step)) for (const block of step.blocks) {
        if (!block.section?.host || !flowTest(block.section.when, id => this.read(id))) continue;
        let state = this.sectionState?.get(block.section.id);
        if (!state) { this.loadFields(step, block); state = this.sectionState.get(block.section.id); }
        while (state.loading) {
          await state.work;
          if (this.destroyed || this.generation !== generation) return { cancelled: true, errors };
          state = this.sectionState.get(block.section.id);
          if (!state) return { cancelled: true, errors };
        }
        if (!this.stepVisible(step) || !flowTest(block.section.when, id => this.read(id))) continue;
        if (state.error) errors.push({ step: step.id, message: fill(this.labels.flowFieldsFailed, { message: state.error }) });
      }
      return { errors };
    },
    async next() {
      if (this.busy || this.destroyed || this.phase !== "form") return false;
      const step = this.step, generation = this.generation, result = await this.sectionPrerequisites([step]);
      if (result.cancelled || this.destroyed || generation !== this.generation || step !== this.step) return false;
      if (result.errors.length) { this.stepErrors.set(step.id, result.errors[0].message); this.showSummary(step); return false; }
      return flowOptionsNext.call(this);
    },
    async submit() {
      if (this.busy || this.destroyed || this.phase !== "form") return null;
      const generation = this.generation, result = await this.sectionPrerequisites(this.visibleSteps());
      if (result.cancelled || this.destroyed || generation !== this.generation) return null;
      if (result.errors.length) { for (const error of result.errors) this.stepErrors.set(error.step, error.message); return null; }
      return flowOptionsSubmit.call(this);
    },
    async validateStep(step, show, current = () => true) {
      const result = await this.sectionPrerequisites([step]);
      return result.cancelled || result.errors.length || !current()
        ? { valid: false, errors: result.errors, warnings: [], moved: !!result.cancelled }
        : flowOptionsValidate.call(this, step, show, current);
    }
  });
