  // Read-only information belongs to the document, never to answers or the submitted proposal.
  FLOW_HOST.facts = {
    finish(model) {
      for (const step of model.steps) {
        const facts = step.raw.facts;
        if (facts === undefined) continue;
      if (step.type !== "info" || !Array.isArray(facts) || facts.length > 32) flowFail("only information steps hold up to 32 read-only facts");
      step.facts = facts.map(fact => {
        flowKeys(fact, ["label", "value"], "A flow fact");
        return { label: flowString(fact.label, 200, "A fact label", true), value: flowString(fact.value, 32768, "A fact value", true) };
      });
      }
    },
    render(section, facts) {
      const list = h("dl", "cx-flow-answers");
      for (const fact of facts) {
        const item = h("div", "cx-flow-answer"), label = h("dt"), value = h("dd", "cx-flow-answer-value");
        setText(label, fact.label); setText(value, fact.value); item.append(label, value); list.appendChild(item);
      }
      section.appendChild(list);
    }
  };

  const flowFactsShell = FlowView.prototype.stepShell;
  FlowView.prototype.stepShell = function(step) {
    const section = flowFactsShell.call(this, step);
    if (step.facts?.length) FLOW_HOST.facts.render(section, step.facts);
    return section;
  };
