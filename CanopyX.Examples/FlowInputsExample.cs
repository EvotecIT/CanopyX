using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>A device registration flow: text formats with example hints, a custom pattern with a mask, and a signature.</summary>
internal static class FlowInputsExample {
    internal static void Write(string output) {
        var flow = new CanopyFlow("register-device", "Register a device") { Submit = new CanopyFlowSubmit("Register") };
        flow.Step("device", "Which device is it?", step => step
            .Text("name", "Device name", f => f.Required().Format(CanopyFlowTextFormat.Host))
            .Text("mac", "MAC address", f => f.Required().Format(CanopyFlowTextFormat.Mac).Half())
            .Text("address", "Management address", f => f.Format(CanopyFlowTextFormat.IpAddress).Half())
            .Text("network", "Network", f => f.Format(CanopyFlowTextFormat.Cidr).Half())
            .Text("serial", "Hardware ID", f => f.Format(CanopyFlowTextFormat.Guid).Half())
            .Text("asset", "Asset tag", f => f.Required().Pattern("[A-Z]{3}-[0-9]{4}").Mask("AAA-0000").Message("Use three capital letters, a dash and four digits.")));
        flow.Step("contact", "Who looks after it?", step => step
            .Text("owner", "Owner's email", f => f.Required().Format(CanopyFlowTextFormat.Email))
            .Text("phone", "On-call phone", f => f.Format(CanopyFlowTextFormat.Phone).Half())
            .Text("window", "Maintenance starts", f => f.Format(CanopyFlowTextFormat.Time).Half().Help("Local time, 24-hour.")));
        flow.Step("consent", "Sign the registration", step => step
            .Signature("signature", "Signature", f => f.Required().Help("Sign as the device owner, or type your name.")));
        flow.Review(review => review.Declaration("The device joins the inventory once an administrator approves it."));
        Directory.CreateDirectory(output);
        File.WriteAllText(Path.Combine(output, "flow-device-registration.html"), flow.ToHtmlPage(new CanopyHtmlOptions { Title = "Register a device" }));
    }
}
