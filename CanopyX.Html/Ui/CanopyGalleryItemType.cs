namespace CanopyX.Html.Ui;

/// <summary>What a gallery item opens in the viewer.</summary>
public enum CanopyGalleryItemType {
    /// <summary>An image at the item's address. The default.</summary>
    Image,
    /// <summary>A page, video or document at the item's address, shown in a frame.</summary>
    Frame,
    /// <summary>Trusted HTML the gallery carries in a template.</summary>
    Content
}
