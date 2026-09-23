import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AskResult, ClassCount, DetectionHit, IndexJob, LensStatus, SearchParams, SourceRequest, SourceSnapshot,
  TimeBucketCount, VideoInfo, VideoSource,
} from './models';

/** Typed wrapper over /api. One method per route in Program.cs. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  videos(): Observable<VideoInfo[]> { return this.http.get<VideoInfo[]>('/api/videos'); }
  video(id: number): Observable<VideoInfo> { return this.http.get<VideoInfo>(`/api/videos/${id}`); }

  search(p: SearchParams): Observable<DetectionHit[]> {
    return this.http.get<DetectionHit[]>('/api/detections/search', { params: this.params(p as Record<string, unknown>) });
  }
  countsByClass(p: { videoId?: number | null; classes?: string[] | null }): Observable<ClassCount[]> {
    return this.http.get<ClassCount[]>('/api/detections/counts', { params: this.params(p) });
  }
  countsByTime(p: { videoId?: number | null; classes?: string[] | null; bucketMinutes: number }): Observable<TimeBucketCount[]> {
    return this.http.get<TimeBucketCount[]>('/api/detections/counts', { params: this.params(p) });
  }
  /** JPEG of one moment, with the box drawn by the caller. */
  frameUrl(videoId: number, t: number): string {
    return `/api/frame?videoId=${videoId}&t=${Math.max(0, t).toFixed(2)}`;
  }

  ask(question: string, videoId: number | null): Observable<AskResult> {
    return this.http.post<AskResult>('/api/ask', { question, videoId });
  }

  upload(form: FormData): Observable<HttpEvent<IndexJob>> {
    return this.http.post<IndexJob>('/api/videos/upload', form, { reportProgress: true, observe: 'events' });
  }
  jobs(): Observable<IndexJob[]> { return this.http.get<IndexJob[]>('/api/jobs'); }
  job(id: string): Observable<IndexJob> { return this.http.get<IndexJob>(`/api/jobs/${id}`); }

  sources(): Observable<SourceSnapshot[]> { return this.http.get<SourceSnapshot[]>('/api/sources'); }
  addSource(req: SourceRequest): Observable<VideoSource> { return this.http.post<VideoSource>('/api/sources', req); }
  updateSource(id: number, req: SourceRequest): Observable<VideoSource> { return this.http.put<VideoSource>(`/api/sources/${id}`, req); }
  enableSource(id: number): Observable<void> { return this.http.post<void>(`/api/sources/${id}/enable`, null); }
  disableSource(id: number): Observable<void> { return this.http.post<void>(`/api/sources/${id}/disable`, null); }
  deleteSource(id: number): Observable<void> { return this.http.delete<void>(`/api/sources/${id}`); }
  /** ffmpeg-per-viewer fallback when MediaMTX is not available. */
  mjpegUrl(id: number): string { return `/api/sources/${id}/mjpeg`; }

  status(): Observable<LensStatus> { return this.http.get<LensStatus>('/api/status'); }

  private params(obj: Record<string, unknown>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length) p = p.set(k, v.join(','));
        continue;
      }
      p = p.set(k, String(v));
    }
    return p;
  }
}
