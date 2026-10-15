namespace CanopyX.Data;

/// <summary>Why a remote grid request was rejected. Every value maps to a client error, never to a server failure.</summary>
public enum CanopyRequestError {
    /// <summary>The body is not well-formed JSON, is too deeply nested, or a value has the wrong JSON type.</summary>
    InvalidJson = 0,
    /// <summary>The document envelope, view identity or a required field is missing or wrong.</summary>
    InvalidDocument,
    /// <summary>A column is not declared by the view or not mapped by the server.</summary>
    UnknownColumn,
    /// <summary>A sort key names a column that is not sortable, or the same column twice.</summary>
    InvalidSort,
    /// <summary>A filter names a column the server does not allow filtering on.</summary>
    ColumnNotFilterable,
    /// <summary>An operator is unknown, or does not fit the column kind.</summary>
    InvalidOperator,
    /// <summary>An operand has the wrong type or arity, or is out of range for the column.</summary>
    InvalidOperand,
    /// <summary>A request exceeds a configured or protocol safety limit.</summary>
    LimitExceeded,
    /// <summary>The requested window starts beyond the matching rows.</summary>
    OffsetOutOfRange,
    /// <summary>The request expects a dataset revision the server no longer serves.</summary>
    StaleRevision,
    /// <summary>The request uses a protocol capability that this endpoint does not provide.</summary>
    Unsupported,
    /// <summary>A value list was requested for a column that the view does not declare as a facet column.</summary>
    NotFacetable,
    /// <summary>The export scope, selection or column list is invalid, or the record count changed.</summary>
    InvalidExport,
    /// <summary>The export format is not registered.</summary>
    UnknownFormat
}
