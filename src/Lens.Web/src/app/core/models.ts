/** Shapes returned by the Lens API (src/Lens.Api/Program.cs). All JSON is camelCase. */

export interface VideoInfo {
  id: number;
  path: string;
  name: string;
  camera: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  startedAt: string;
  indexedAt: string;
  detectionCount: number;
  isLive: boolean;
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DetectionHit extends Box {
  videoId: number;
  videoName: string;
  camera: string;
  timestampSeconds: number;
  occurredAt: string;
  className: string;
  confidence: number;
  /** How many raw sightings merged into this event. */
  count: number;
  endSeconds: number;
  /** Timestamp the box belongs to: the frame worth showing. */
  bestSeconds: number;
}

export interface ClassCount {
  className: string;
  count: number;
  firstSeconds: number;
  lastSeconds: number;
}

export interface TimeBucketCount {
  bucketStart: string;
  className: string;
  count: number;
}

export interface SearchParams {
  videoId?: number | null;
  camera?: string | null;
  classes?: string[] | null;
  fromSeconds?: number | null;
  toSeconds?: number | null;
  from?: string | null;
  to?: string | null;
  minConfidence?: number | null;
  minArea?: number | null;
  limit?: number | null;
  /** Merge window in seconds. 0 returns raw per-frame sightings. */
  group?: number | null;
}

export type SourceStatus = 'connecting' | 'running' | 'reconnecting' | 'disabled' | 'stopped';

export interface SourceSnapshot {
  id: number;
  name: string;
  camera: string;
  url: string;
  detectUrl: string | null;
  overlayOffsetMs: number;
  sampleFps: number;
  confidence: number;
  enabled: boolean;
  simulate: boolean;
  status: SourceStatus;
  connectedAt: string | null;
  lastFrameAt: string | null;
  lastError: string | null;
  attempts: number;
  nextRetryAt: string | null;
  measuredFps: number;
  frames: number;
  detections: number;
  inferenceMs: number;
  videoId: number | null;
  /** Sightings per class in the last 60 seconds. */
  recent: Record<string, number>;
  /** MediaMTX path for WebRTC playback. Null for simulated file sources. */
  webrtcPath: string | null;
}

export interface SourceRequest {
  url: string;
  name?: string | null;
  camera?: string | null;
  sampleFps?: number | null;
  confidence?: number | null;
  simulate?: boolean | null;
  detectUrl?: string | null;
  overlayOffsetMs?: number | null;
}

export interface VideoSource {
  id: number;
  name: string;
  camera: string;
  url: string;
  detectUrl: string | null;
  overlayOffsetMs: number;
  sampleFps: number;
  confidence: number;
  enabled: boolean;
  simulate: boolean;
  createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface IndexJob {
  id: string;
  fileName: string;
  camera: string;
  status: JobStatus;
  percent: number;
  frames: number;
  detections: number;
  framesPerSecond: number;
  videoId: number | null;
  error: string | null;
  perClass: Record<string, number> | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface LensStatus {
  sources: SourceSnapshot[];
  jobs: IndexJob[];
  framesArchiveBytes: number;
  uptimeSeconds: number;
  mediamtx: { available: boolean; webrtcBaseUrl: string };
}

export interface LiveDetection extends Box {
  className: string;
  confidence: number;
}

/** One "detection" message from the SignalR hub, plus the client clock when it arrived. */
export interface LiveEvent {
  sourceId: number;
  videoId: number;
  camera: string;
  name: string;
  frameIndex: number;
  timestampSeconds: number;
  occurredAt: string;
  frameSaved: boolean;
  detections: LiveDetection[];
  receivedAt: number;
}

export interface ToolCallTrace {
  tool: string;
  input: unknown;
  resultChars: number;
  ms: number;
}

export interface AskResult {
  answer: string;
  hits: DetectionHit[];
  toolCalls: ToolCallTrace[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}
