using System.Runtime.CompilerServices;

// The remote adapter shares protocol value semantics without exposing implementation helpers as public API.
[assembly: InternalsVisibleTo("CanopyX.Data")]
