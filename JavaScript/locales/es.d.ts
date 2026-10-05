import type { CanopyLabels } from "../protocol.js";
/** Complete Spanish browser labels; individual properties can be overridden by the host. */
export const labels: Readonly<Required<CanopyLabels>>;
/** Labels used only by a script-free static fallback. */
export const staticLabels: Readonly<{ overflowNote: string; unknownTotal: string; hiddenRows: string; fullReport: string }>;
export default labels;
