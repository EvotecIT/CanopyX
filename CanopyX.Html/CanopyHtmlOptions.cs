using System;

namespace CanopyX.Html;

/// <summary>
/// Options for writing a CanopyX view as an HTML fragment or page.
/// </summary>
public sealed class CanopyHtmlOptions {
    private string _assetBaseUrl = "assets/";
    private string _language = "en";

    /// <summary>Gets or sets how a full page includes the runtime assets. Fragments never include them.</summary>
    public CanopyAssetMode AssetMode { get; set; }

    /// <summary>
    /// Gets or sets the folder, relative to the page, that holds <c>canopyx.js</c> and <c>canopyx.css</c> when
    /// <see cref="AssetMode"/> is <see cref="CanopyAssetMode.External"/>. Defaults to <c>assets/</c>.
    /// </summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public string AssetBaseUrl {
        get => _assetBaseUrl;
        set {
            var url = value ?? throw new ArgumentNullException(nameof(value));
            _assetBaseUrl = url.Length == 0 || url.EndsWith("/", StringComparison.Ordinal) ? url : url + "/";
        }
    }

    /// <summary>Gets or sets the colour theme.</summary>
    public CanopyTheme Theme { get; set; }

    /// <summary>
    /// Gets or sets the height of the view as a CSS length, for example <c>600px</c> or <c>70vh</c>. Fragments without
    /// a height use the stylesheet default (480px); full pages fill the window.
    /// </summary>
    public string? Height { get; set; }

    /// <summary>Gets or sets the page title. Defaults to the view label.</summary>
    public string? Title { get; set; }

    /// <summary>Gets or sets the page language, used for the <c>lang</c> attribute and number formatting. Defaults to <c>en</c>.</summary>
    /// <exception cref="ArgumentException">The value is null or empty.</exception>
    public string Language {
        get => _language;
        set => _language = string.IsNullOrEmpty(value) ? throw new ArgumentException("Language is required.", nameof(value)) : value;
    }
}
