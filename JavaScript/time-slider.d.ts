// Host-provided snapshot replay for matrix and propagation views (docs/time-slider.md).
import type { MatrixDocument } from "./matrix.js";
import type { PropagationDocument } from "./changes.js";

/** One complete view captured by the host, with the parent view's id and type. Nested sliders are forbidden. */
export interface TimeSnapshot<T extends MatrixDocument | PropagationDocument> {
  /** ISO 8601 instant with a zone. Instants are distinct and strictly ascending at Date.parse millisecond precision. */
  at: string;
  /** Optional visible description of this frame, at most 200 characters. */
  label?: string;
  view: Omit<T, "timeSlider"> & { timeSlider?: never };
}

/** Local replay of 1 to 500 host-provided frames. Playback starts manually; no history is fetched. */
export interface TimeSlider<T extends MatrixDocument | PropagationDocument> {
  /** Timed playback interval, 100 to 60,000 milliseconds. Defaults to 1,000. Reduced motion disables timed play. */
  interval?: number;
  /** Zero-based initial frame index. Omitted selects the latest frame. */
  initial?: number;
  snapshots: TimeSnapshot<T>[];
}

/** Current frame and playback status. Available after the containing view's ready promise resolves. */
export interface TimePlaybackState {
  /** Zero-based selected frame. */
  index: number;
  count: number;
  /** The selected snapshot's ISO 8601 instant. */
  at: string;
  playing: boolean;
  reducedMotion: boolean;
}

/** The nested api.playback controller. Methods are synchronous after api.ready, which includes initial frame application. */
export interface TimePlaybackApi {
  /** Starts timed replay unless reduced motion is requested. */
  play(): void;
  pause(): void;
  /** Moves by delta frames, one forward by default. */
  step(delta?: number): void;
  /** Selects a zero-based frame. */
  seek(index: number): void;
  getState(): TimePlaybackState;
}

declare module "./matrix.js" {
  interface MatrixDocument {
    /** Optional local snapshot replay. Manual stepping remains available with reduced motion. */
    timeSlider?: TimeSlider<MatrixDocument>;
  }
}

declare module "./changes.js" {
  interface PropagationDocument {
    /** Optional local snapshot replay. Manual stepping remains available with reduced motion. */
    timeSlider?: TimeSlider<PropagationDocument>;
  }
}
