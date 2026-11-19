namespace CanopyX.Html.Ui;

/// <summary>What a gallery item opens in the viewer.</summary>
public enum CanopyGalleryItemType {
    /// <summary>An image at the item's address. The default.</summary>
    Image,
    /// <summary>A page or document at the item's address, shown in a frame.</summary>
    Frame,
    /// <summary>Trusted HTML the gallery carries in a template.</summary>
    Content,
    /// <summary>A video file at the item's address, played by the browser's own video player.</summary>
    Video,
    /// <summary>A YouTube video, given by its watch, short or embed address or its id, embedded from youtube-nocookie.com.</summary>
    YouTube
}
