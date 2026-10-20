namespace CanopyX.Examples;

/// <summary>
/// Editing existing settings: the flow starts from the current values, a stored access key stays unless the reader types a
/// new one, the review page shows only the changes as "was / now", and the proposal carries the changes and a JSON patch.
/// A switch above the flow chooses how the mock host answers, to show the saved, accepted, error and conflict states.
/// </summary>
internal static class FlowEditSettingsExample {
    internal static CanopyFlow Flow() {
        var flow = new CanopyFlow("archive-settings", "Archive settings") {
            Description = "Change how records are archived. Only what you change is saved.",
            Mode = CanopyFlowMode.Free,
            Baseline = "rev-41",
            Submit = new CanopyFlowSubmit("Save changes")
        };
        flow.Step("storage", "Storage", step => step
            .Choice("target", "Archive to", f => f.Option("disk", "Local disk").Option(new CanopyFlowOption("share", "Network share") { Description = "A path every node can reach." })
                .Option(new CanopyFlowOption("bucket", "Object storage") { Description = "Any object storage service." }).Required().Path("archive.target"))
            .Text("location", "Location", f => f.Required().Help("A folder, share path or bucket name.").Path("archive.location"))
            .Secret("accessKey", "Access key", f => f.When(CanopyFlowCondition.Equal("target", "bucket")))
            .Toggle("compress", "Compress archives", f => f.Path("archive.compress")));
        flow.Step("retention", "Retention", step => step
            .Duration("keep", "Keep archives for", f => f.Required().Units(CanopyFlowDurationUnit.Days).Range(TimeSpan.FromDays(7), TimeSpan.FromDays(3650)).Path("archive.keep"))
            .Number("copies", "Copies to keep", f => f.Range(1, 10).Step(1).Half().Path("archive.copies"))
            .MultiChoice("include", "Include", f => f.Option("records", "Records").Option("attachments", "Attachments").Option("history", "Change history")
                .Option("comments", "Comments").Option("audit", "Audit trail").Required().Path("archive.include")));
        flow.Review(review => review.Declaration("Changes apply from the next archive run."));
        flow.Initial["target"] = "bucket";
        flow.Initial["location"] = "records-archive";
        flow.Initial["compress"] = true;
        flow.Initial["keep"] = TimeSpan.FromDays(90);
        flow.Initial["copies"] = 3d;
        flow.Initial["include"] = new[] { "records", "attachments", "history" };
        flow.StoredSecrets.Add("accessKey");
        return flow;
    }

    internal static void Write(string output) {
        // The mock answers: saved shows the result panel; accepted shows progress the page moves, then saves; error and conflict
        // return to the review page with the host's messages.
        const string script = """
<fieldset class="flow-mock" id="flow-mock"><legend>Mock host answers</legend>
<label><input type="radio" name="flow-mock" value="saved" checked> Saved</label>
<label><input type="radio" name="flow-mock" value="accepted"> Accepted</label>
<label><input type="radio" name="flow-mock" value="error"> Error</label>
<label><input type="radio" name="flow-mock" value="conflict"> Conflict</label>
</fieldset>
<script>
(() => {
  const mock = document.getElementById("flow-mock");
  document.querySelector(".cx-main").prepend(mock);
  const choice = () => mock.querySelector("input:checked").value;
  window.flowAnswer = detail => {
    const flow = document.querySelector("[data-canopyx-host]").canopyx;
    switch (choice()) {
      case "accepted": {
        let done = 0;
        const timer = setInterval(() => {
          done += 1;
          flow.setProgress({ done, total: 4, message: "Rewriting archive " + done + " of 4." });
          if (done === 4) { clearInterval(timer); flow.complete({ status: "saved", message: "The archive settings were saved and every archive was rewritten." }); }
        }, 700);
        return { status: "accepted", message: "Existing archives are being rewritten with the new settings." };
      }
      case "error": return { status: "error", message: "The location could not be reached.", fieldErrors: { location: "Not reachable from the archive service." } };
      case "conflict": return { status: "conflict", message: "Someone changed these settings after you opened them." };
      default: return { status: "saved", message: "Archive settings saved: " + detail.changes.length + " changes.",
        result: [{ label: "New access key", value: "AK-7Q2M-91XD-4PLC", once: true }] };
    }
  };
  document.addEventListener("canopyx:flowReload", () => { document.getElementById("flow-received").textContent = "The host was asked to reload the current settings."; });
})();
</script>
""";
        FlowExamplePage.Write(output, "flow-edit-settings", Flow(), "Archive settings", script);
    }
}
