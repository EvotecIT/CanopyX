namespace CanopyX;

/// <summary>Where a choosing field's options come from (<see cref="CanopyFlowField.OptionsSource"/>).</summary>
public enum CanopyFlowOptionsSource {
    /// <summary>The field's own <see cref="CanopyFlowField.Options"/>. The default.</summary>
    Document,

    /// <summary>The host's <c>options</c> hook (or an endpoint route), asked as the reader reaches the field and again when a field it depends on changes.</summary>
    Host
}