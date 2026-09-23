import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpEventType } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { StatusService } from '../../core/status.service';
import { ClassCount, IndexJob, VideoInfo } from '../../core/models';
import { errorMessage } from '../../core/errors';
import { COCO_CLASSES, classColor } from '../../core/coco';
import { entriesDesc, fmtDateTime, fmtDuration, timeAgo, toLocalInput } from '../../core/format';

/** Upload recordings, watch them index, and browse the library. Uploads go into the same background queue as the CLI indexer. */
@Component({
  selector: 'lens-videos',
  imports: [FormsModule, RouterLink, DecimalPipe],
  template: `
    <div class="page-head">
      <h1>Videos</h1>
      <span class="muted small">Anything ffmpeg can decode: mp4, mkv, mov, avi, ts, m4v, webm.</span>
    </div>

    <section class="panel">
      <h2>Upload a recording</h2>
      <div class="fgrid">
        <label class="field">
          <span>File</span>
          <input type="file" accept=".mp4,.mkv,.mov,.avi,.ts,.m4v,.webm" (change)="pick($event)" />
        </label>
        <label class="field">
          <span>Camera label</span>
          <input [(ngModel)]="camera" name="camera" placeholder="default" />
        </label>
        <label class="field">
          <span>Footage starts at</span>
          <input type="datetime-local" [(ngModel)]="startedAt" name="startedAt" />
        </label>
        <label class="field">
          <span>Sample fps</span>
          <input type="number" min="0.5" max="10" step="0.5" [(ngModel)]="fps" name="fps" />
        </label>
        <label class="field">
          <span>Confidence</span>
          <input type="number" min="0.05" max="0.95" step="0.05" [(ngModel)]="confidence" name="conf" />
        </label>
        <label class="field">
          <span>Only these classes (optional)</span>
          <select multiple size="4" (change)="pickClasses($event)">
            @for (c of allClasses; track c) { <option [value]="c" [selected]="classes().includes(c)">{{ c }}</option> }
          </select>
        </label>
      </div>
      <div class="row form-actions">
        <button (click)="upload()" [disabled]="!file() || uploading()">
          {{ uploading() ? 'Uploading ' + progress() + '%' : 'Upload and index' }}
        </button>
        @if (file(); as f) { <span class="muted small">{{ f.name }} · {{ mb(f.size) }} MB</span> }
        <span class="grow"></span>
        <span class="muted small">Wall-clock start makes "after 6pm" questions work.</span>
      </div>
      @if (uploading()) { <div class="bar"><div class="bar-fill" [style.width.%]="progress()"></div></div> }
      @if (error(); as e) { <p class="error small">{{ e }}</p> }
    </section>

    @if (jobs().length) {
      <section class="panel">
        <h2>Indexing</h2>
        <ul class="jobs">
          @for (j of jobs(); track j.id) {
            <li>
              <div class="row">
                <span class="dot {{ j.status === 'done' ? 'running' : j.status === 'failed' ? 'stopped' : 'connecting' }}"></span>
                <b class="ellipsis">{{ j.fileName }}</b>
                <span class="tag">{{ j.camera }}</span>
                <span class="grow"></span>
                <span class="muted small">
                  {{ j.status }}
                  @if (j.status === 'running' || j.status === 'done') {
                    · {{ j.frames }} frames · {{ j.detections }} detections · {{ j.framesPerSecond | number: '1.0-1' }} fps
                  }
                </span>
              </div>
              <div class="bar"><div class="bar-fill" [class.failed]="j.status === 'failed'" [style.width.%]="j.percent"></div></div>
              @if (j.error; as err) { <div class="small error">{{ err }}</div> }
              @if (j.perClass; as per) {
                <div class="row">
                  @for (c of classesOf(per); track c.key) {
                    <span class="tag" [style.border-color]="color(c.key)">{{ c.key }} {{ c.value }}</span>
                  }
                  @if (j.videoId) { <a class="small" routerLink="/search">open in search</a> }
                </div>
              }
            </li>
          }
        </ul>
      </section>
    }

    <section class="panel">
      <div class="row">
        <h2>Library</h2>
        <span class="grow"></span>
        <button class="ghost small" (click)="load()">Refresh</button>
      </div>
      @if (videos().length === 0) {
        <p class="muted">Nothing indexed yet. Upload a clip above, or run the CLI indexer against a file.</p>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>#</th><th>Name</th><th>Camera</th><th>Size</th><th>Length</th><th>Starts</th><th>Detections</th><th></th></tr>
            </thead>
            <tbody>
              @for (v of videos(); track v.id) {
                <tr [class.selected]="openId() === v.id">
                  <td>{{ v.id }}</td>
                  <td>
                    <b class="ellipsis">{{ v.name }}</b>
                    @if (v.isLive) { <span class="tag">live</span> }
                    <div class="muted small mono path" [title]="v.path">{{ v.path }}</div>
                  </td>
                  <td>{{ v.camera }}</td>
                  <td class="small">{{ v.width }}×{{ v.height }}<br /><span class="muted">{{ v.fps | number: '1.0-1' }} fps</span></td>
                  <td class="small">{{ dur(v.durationSeconds) }}</td>
                  <td class="small">{{ when(v.startedAt) }}<br /><span class="muted">indexed {{ ago(v.indexedAt) }}</span></td>
                  <td><b>{{ v.detectionCount }}</b></td>
                  <td class="actions">
                    <button class="ghost small" (click)="breakdown(v)">{{ openId() === v.id ? 'Hide' : 'Classes' }}</button>
                    <a class="btn ghost small" routerLink="/search">Search</a>
                  </td>
                </tr>
                @if (openId() === v.id) {
                  <tr class="detail">
                    <td colspan="8">
                      @if (counts().length === 0) { <span class="muted small">no detections</span> }
                      @for (c of counts(); track c.className) {
                        <span class="tag" [style.border-color]="color(c.className)">{{ c.className }} <b>{{ c.count }}</b></span>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class VideosPage {
  private readonly api = inject(ApiService);
  private readonly status = inject(StatusService);

  readonly allClasses = COCO_CLASSES;
  readonly videos = signal<VideoInfo[]>([]);
  readonly counts = signal<ClassCount[]>([]);
  readonly openId = signal<number | null>(null);
  readonly file = signal<File | null>(null);
  readonly camera = signal('default');
  readonly startedAt = signal(toLocalInput(new Date()));
  readonly fps = signal(2);
  readonly confidence = signal(0.35);
  readonly classes = signal<string[]>([]);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);

  /** Jobs come from the shared status poll, so progress updates without this page polling as well. */
  readonly jobs = computed<IndexJob[]>(() => this.status.status()?.jobs ?? []);

  constructor() {
    void this.load();
  }

  color(name: string): string { return classColor(name); }
  dur(s: number): string { return fmtDuration(s); }
  when(iso: string): string { return fmtDateTime(iso); }
  ago(iso: string): string { return timeAgo(iso); }
  mb(bytes: number): string { return (bytes / 1024 / 1024).toFixed(1); }
  classesOf(per: Record<string, number>) { return entriesDesc(per).slice(0, 8); }

  pick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.file.set(input.files?.length ? input.files[0] : null);
    this.error.set(null);
  }

  pickClasses(ev: Event): void {
    const select = ev.target as HTMLSelectElement;
    this.classes.set([...select.selectedOptions].map((o) => o.value));
  }

  async load(): Promise<void> {
    try {
      this.videos.set(await firstValueFrom(this.api.videos()));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async breakdown(v: VideoInfo): Promise<void> {
    if (this.openId() === v.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(v.id);
    this.counts.set([]);
    try {
      this.counts.set(await firstValueFrom(this.api.countsByClass({ videoId: v.id })));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  upload(): void {
    const f = this.file();
    if (!f) return;
    const form = new FormData();
    form.append('file', f, f.name);
    form.append('camera', this.camera().trim() || 'default');
    const started = this.startedAt();
    if (started) form.append('startedAt', new Date(started).toISOString());
    form.append('fps', String(this.fps()));
    form.append('confidence', String(this.confidence()));
    if (this.classes().length) form.append('classes', this.classes().join(','));

    this.uploading.set(true);
    this.progress.set(0);
    this.error.set(null);
    this.api.upload(form).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) {
          this.progress.set(Math.round((ev.loaded / ev.total) * 100));
        } else if (ev.type === HttpEventType.Response) {
          this.uploading.set(false);
          this.progress.set(100);
          this.file.set(null);
          void this.status.refresh();
          void this.load();
        }
      },
      error: (e: unknown) => {
        this.uploading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
