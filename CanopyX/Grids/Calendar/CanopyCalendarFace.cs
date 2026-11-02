using System;
using System.Globalization;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The face of a resource in a <see cref="CanopyCalendar"/>: an avatar image, initials or an icon drawn in front of the
/// resource's events, so a shared screen shows whose plan an event is before its title can be read. Sources carry the same
/// three values on <see cref="CanopyCalendarSource"/>. The face is decoration; accessible names keep naming the event.
/// </summary>
public sealed class CanopyCalendarFace {
    private static readonly Regex ImageData = new("^data:image/(?:png|jpeg|gif|webp|svg\\+xml);base64,[A-Za-z0-9+/]+=*$", RegexOptions.CultureInvariant);
    private string _resource;
    private string? _avatar, _initials, _icon;

    /// <summary>Creates the face of a resource.</summary>
    /// <param name="resource">The resource id, a node id of <see cref="CanopyCalendar.Resources"/> or a value of the resource column.</param>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public CanopyCalendarFace(string resource) {
        CanopyIdentifiers.Require(resource, nameof(resource));
        _resource = resource;
    }

    /// <summary>Gets or sets the resource id.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string Resource {
        get => _resource;
        set { CanopyIdentifiers.Require(value, nameof(value)); _resource = value; }
    }

    /// <summary>
    /// Gets or sets the avatar image: a relative or same-origin http(s) URL, or a base64 <c>data:image</c> URL (PNG, JPEG, GIF,
    /// WebP or SVG) of at most 100,000 characters; null for none. A failed image falls back to the initials.
    /// </summary>
    /// <exception cref="ArgumentException">The value is neither.</exception>
    public string? Avatar { get => _avatar; set => _avatar = CheckAvatar(value, nameof(value)); }

    /// <summary>Gets or sets the initials, 1 to 3 characters, shown when there is no avatar or it fails to load; null for none.</summary>
    /// <exception cref="ArgumentException">The value is blank or longer than 3 characters.</exception>
    public string? Initials { get => _initials; set => _initials = CheckShort(value, 3, nameof(value)); }

    /// <summary>Gets or sets an icon, 1 to 4 characters such as an emoji, shown when there is neither an avatar nor initials; null for none.</summary>
    /// <exception cref="ArgumentException">The value is blank or longer than 4 characters.</exception>
    public string? Icon { get => _icon; set => _icon = CheckShort(value, 4, nameof(value)); }

    internal void Validate() {
        if (_avatar == null && _initials == null && _icon == null) throw new InvalidOperationException("A calendar face needs an avatar, initials or an icon.");
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        Validate();
        writer.BeginObject().Property("resource", _resource);
        WriteFace(writer, _avatar, _initials, _icon);
        writer.EndObject();
    }

    internal static void WriteFace(CanopyJsonWriter writer, string? avatar, string? initials, string? icon) =>
        writer.OptionalProperty("avatar", avatar).OptionalProperty("initials", initials).OptionalProperty("icon", icon);

    internal static string? CheckAvatar(string? value, string parameter) =>
        value == null || value.Length <= 100000 && ImageData.IsMatch(value) || !value.StartsWith("data:", StringComparison.OrdinalIgnoreCase) && CanopyCalendarSource.IsIcsUrl(value) ? value :
            throw new ArgumentException("An avatar is a relative or same-origin http(s) URL, or a base64 data:image URL of at most 100,000 characters.", parameter);

    internal static string? CheckShort(string? value, int most, string parameter) {
        if (value == null) return null;
        var trimmed = value.Trim();
        return trimmed.Length > 0 && new StringInfo(trimmed).LengthInTextElements <= most ? trimmed :
            throw new ArgumentException("The value needs 1 to " + most + " visible characters.", parameter);
    }
}
