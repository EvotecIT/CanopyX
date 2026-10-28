import type { CanopyBadge } from "./protocol.js";

/** An annotation supplied by the host, never inferred from the records. Disabled steps still open for reading. */
export type GridPathFlag = "cycle" | "foreign" | "disabled";

/** One occurrence of a record; repeated identities retain their supplied position and annotations. */
export interface GridPathHop {
  /** Explicit stable identity of an existing inline grid record. */
  record: string;
  /** Optional host explanation, 1 to 4,096 characters, nonblank and without controls. */
  label?: string;
  /** Distinct annotations in display order. */
  flags?: GridPathFlag[];
  /** Up to 16 existing-wire badges; text is at most 256 characters and title at most 4,096. */
  badges?: CanopyBadge[];
}

/** A source-to-target chain with one to 256 explicitly ordered steps. */
export interface GridPathChain {
  /** Unique among chains; nonblank, without controls, at most 256 characters. */
  id: string;
  /** Nonblank host heading without controls, at most 4,096 characters. */
  label: string;
  hops: GridPathHop[];
}

/** Optional path renderer over stable inline grid records. No route discovery or domain calculations. */
export interface GridPathDefinition {
  /** Defaults to the row header, then the first visible column. */
  titleColumn?: string;
  /** At most 200 chains and 10,000 step occurrences in total. Empty shows the empty state. */
  chains: GridPathChain[];
}
