import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { StatusService } from '../../core/status.service';
import { SourceRequest, SourceSnapshot } from '../../core/models';
import { errorMessage } from '../../core/errors';
import { entriesDesc, timeAgo } from '../../core/format';

interface Draft {
  id: number | null;
  url: string;
  name: string;
  camera: string;
  detectUrl: string;
  sampleFps: number;
  confidence: number;
  overlayOffsetMs: number;
}

const blank = (): Draft => ({
  id: null, url: '', name: '', camera: 'default', detectUrl: '', sampleFps: 2, confidence: 0.35, overlayOffsetMs: 300,
});

/** Add, edit, pause, remove the cameras Lens watches. Everything here writes straight through /api/sources. */
@Component({
  selector: 'lens-cameras',
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="page-head">
      <h1>Cameras</h1>
      <span class="muted small">Lens keeps one ffmpeg reader per camera, reconnects with backoff, and archives a frame a second.</span>
    </div>

    <section class="panel">
      <h2>{{ draft().id === null ? 'Add a camera' : 'Edit camera #' + draft().id }}</h2>
      <div class="fgrid">
        <label class="field">
          <span>Stream URL or local file</span>
          <input [(ngModel)]="draft().url" name="url" placeholder="rtsp://host:8554/cam1" (keyup.enter)="save()" />
        </label>
        <label class="field">
          <span>Name</span>
          <input [(ngModel)]="draft().name" name="name" placeholder="front gate" />
        </label>
        <label class="field">
          <span>Camera label</span>
          <input [(ngModel)]="draft().camera" name="camera" placeholder="default" />
        </label>
        <label class="field">
          <span>Detection sub-stream (optional)</span>
          <input [(ngModel)]="draft().detectUrl" name="detectUrl" placeholder="rtsp://host:8554/cam1_sub" />
        </label>
        <label class="field">
          <span>Sample fps</span>
          <input type="number" min="0.5" max="10" step="0.5" [(ngModel)]="draft().sampleFps" name="fps" />
        </label>
        <label class="field">
          <span>Confidence</span>
          <input type="number" min="0.05" max="0.95" step="0.05" [(ngModel)]="draft().confidence" name="conf" />
        </label>
        <label class="field">
          <span>Overlay offset (ms)</span>
          <input type="number" min="-2000" max="5000" step="50" [(ngModel)]="draft().overlayOffsetMs" name="offset" />
        </label>
      </div>
      <div class="row form-actions">
        <button (click)="save()" [disabled]="busy() || !draft().url.trim()">{{ draft().id === null ? 'Add camera' : 'Save changes' }}</button>
        @if (draft().id !== null) { <button class="ghost" (click)="draft.set(blank())">Cancel</button> }
        <span class="grow"></span>
        <span class="muted small">A local file path is read at real-time pace and looped, for testing without hardware.</span>
      </div>
      @if (error(); as e) { <p class="error small">{{ e }}</p> }
      @if (notice(); as n) { <p class="ok small">{{ n }}</p> }
    </section>

    @if (sources().length === 0) {
      <div class="panel empty"><p class="muted">No cameras configured yet.</p></div>
    } @else {
      <section class="panel">
        <h2>Configured cameras</h2>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Status</th><th>Name</th><th>Camera</th><th>URL</th><th>Sampling</th>
                <th>Throughput</th><th>Last 60s</th><th></th>
              </tr>
            </thead>
            <tbody>
              @for (s of sources(); track s.id) {
                <tr>
                  <td>
                    <span class="dot {{ s.status }}"></span> {{ s.status }}
                    @if (s.lastError && s.status !== 'running') { <div class="small error">{{ s.lastError }}</div> }
                    @if (s.status === 'reconnecting' && s.nextRetryAt) { <div class="small muted">retry {{ ago(s.nextRetryAt) }}</div> }
                  </td>
                  <td><b>{{ s.name }}</b>@if (s.simulate) { <span class="tag">file</span> }</td>
                  <td>{{ s.camera }}</td>
                  <td class="mono small ellipsis" [title]="s.url">
                    {{ s.url }}
                    @if (s.detectUrl) { <div class="muted path">detect: {{ s.detectUrl }}</div> }
                  </td>
                  <td class="small">{{ s.sampleFps }} fps<br /><span class="muted">conf {{ s.confidence }}</span></td>
                  <td class="small">
                    {{ s.measuredFps | number: '1.0-1' }} fps<br />
                    <span class="muted">{{ s.inferenceMs | number: '1.0-0' }} ms · {{ s.detections }} det</span>
                  </td>
                  <td class="small">
                    @for (c of recent(s); track c.key) { <span class="tag">{{ c.key }} {{ c.value }}</span> }
                    @if (recent(s).length === 0) { <span class="muted">quiet</span> }
                  </td>
                  <td class="actions">
                    <button class="ghost small" (click)="edit(s)">Edit</button>
                    @if (s.enabled) {
                      <button class="ghost small" (click)="toggle(s, false)" [disabled]="busy()">Pause</button>
                    } @else {
                      <button class="ghost small" (click)="toggle(s, true)" [disabled]="busy()">Resume</button>
                    }
                    <button class="danger small" (click)="remove(s)" [disabled]="busy()">
                      {{ confirmId() === s.id ? 'Confirm' : 'Remove' }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
})
export class CamerasPage {
  private readonly api = inject(ApiService);
  private readonly status = inject(StatusService);

  readonly draft = signal<Draft>(blank());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly confirmId = signal<number | null>(null);

  readonly sources = computed(() => this.status.status()?.sources ?? []);

  readonly blank = blank;

  recent(s: SourceSnapshot) {
    return entriesDesc(s.recent).slice(0, 4);
  }

  ago(iso: string): string {
    return timeAgo(iso);
  }

  edit(s: SourceSnapshot): void {
    this.error.set(null);
    this.notice.set(null);
    this.confirmId.set(null);
    this.draft.set({
      id: s.id, url: s.url, name: s.name, camera: s.camera, detectUrl: s.detectUrl ?? '',
      sampleFps: s.sampleFps, confidence: s.confidence, overlayOffsetMs: s.overlayOffsetMs,
    });
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d.url.trim()) return;
    const req: SourceRequest = {
      url: d.url.trim(),
      name: d.name.trim() || null,
      camera: d.camera.trim() || 'default',
      detectUrl: d.detectUrl.trim() || null,
      sampleFps: d.sampleFps,
      confidence: d.confidence,
      overlayOffsetMs: d.overlayOffsetMs,
    };
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      if (d.id === null) {
        const saved = await firstValueFrom(this.api.addSource(req));
        this.notice.set(`Added ${saved.name}. It starts immediately and keeps reconnecting until removed.`);
      } else {
        await firstValueFrom(this.api.updateSource(d.id, req));
        this.notice.set('Saved. Changing a URL or the sampling restarts the pipeline; the overlay offset applies at once.');
      }
      this.draft.set(blank());
      await this.status.refresh();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async toggle(s: SourceSnapshot, enable: boolean): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(enable ? this.api.enableSource(s.id) : this.api.disableSource(s.id));
      await this.status.refresh();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Two-step: the first click arms the button, the second removes. Removing stops ffmpeg and drops the MediaMTX path. */
  async remove(s: SourceSnapshot): Promise<void> {
    if (this.confirmId() !== s.id) {
      this.confirmId.set(s.id);
      setTimeout(() => { if (this.confirmId() === s.id) this.confirmId.set(null); }, 4000);
      return;
    }
    this.confirmId.set(null);
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.deleteSource(s.id));
      this.notice.set(`Removed ${s.name}. Its indexed detections are kept.`);
      if (this.draft().id === s.id) this.draft.set(blank());
      await this.status.refresh();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
