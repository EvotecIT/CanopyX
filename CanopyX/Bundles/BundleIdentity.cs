namespace CanopyX.Bundles;

/// <summary>Preserves identifier code units when hashing file identities, without encoding replacement fallback.</summary>
internal static class BundleIdentity {
    internal static byte[] Bytes(string id) {
        var bytes = new byte[id.Length * 2];
        for (var index = 0; index < id.Length; index++) {
            bytes[index * 2] = (byte)id[index];
            bytes[index * 2 + 1] = (byte)(id[index] >> 8);
        }
        return bytes;
    }
}
