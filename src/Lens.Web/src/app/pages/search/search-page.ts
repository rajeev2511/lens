import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ClassCount, DetectionHit, VideoInfo } from '../../core/models';
import { COCO_CLASSES, COMMON_CLASSES, classColor } from '../../core/coco';
import { errorMessage } from '../../core/errors';
import { fmtClock, fmtDateTime, fmtSeconds, fromLocalInput } from '../../core/format';
import { FrameView } from '../../shared/frame-view';

/**
 * Filter search over everything indexed. Consecutive sightings of one class collapse into an event with a
 * start and an end, so 25 sightings of the same person read as one event; the raw toggle turns that off.
 */
@Component({
  selector: 'lens-search',
  imports: [FormsModule, FrameView, DecimalPipe],
  template: `
    <div class="page-head">
      <h1>Search</h1>
      <span class="muted small">{{ totalIndexed() }} detections indexed across {{ videos().length }} videos</span>
    </div>

    <section class="panel">
      <div class="fgrid">
        <label class="field">
          <span>Video</span>
          <select [(ngModel)]="videoId" name="video">
            <option [ngValue]="null">all videos</option>
            @for (v of videos(); track v.id) {
              <option [ngValue]="v.id">#{{ v.id }} {{ v.name }}{{ v.isLive ? ' (live)' : '' }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Camera</span>
          <select [(ngModel)]="camera" name="camera">
            <option [ngValue]="''">all cameras</option>
            @for (c of cameras(); track c) { <option [ngValue]="c">{{ c }}</option> }
          </select>
        </label>
        <label class="field">
          <span>From (seconds into video)</span>
          <input type="number" min="0" step="1" [(ngModel)]="fromSeconds" name="fromSeconds" placeholder="0" />
        </label>
        <label class="field">
          <span>To (seconds)</span>
          <input type="number" min="0" step="1" [(ngModel)]="toSeconds" name="toSeconds" placeholder="end" />
        </label>
        <label class="field">
          <span>From (wall clock)</span>
          <input type="datetime-local" [(ngModel)]="fromTime" name="fromTime" />
        </label>
        <label class="field">
          <span>To (wall clock)</span>
          <input type="datetime-local" [(ngModel)]="toTime" name="toTime" />
        </label>
        <label class="field">
          <span>Min confidence {{ minConfidence() }}</span>
          <input type="range" min="0" max="0.95" step="0.05" [(ngModel)]="minConfidence" name="minConf" />
        </label>
        <label class="field">
          <span>Min box area {{ minArea() }}</span>
          <input type="range" min="0" max="0.2" step="0.005" [(ngModel)]="minArea" name="minArea" />
        </label>
        <label class="field">
          <span>Merge window (s)</span>
          <input type="number" min="0" max="60" step="0.5" [(ngModel)]="group" name="group" [disabled]="raw()" />
        </label>
        <label class="field">
          <span>Limit</span>
          <input type="number" min="1" max="500" step="10" [(ngModel)]="limit" name="limit" />
        </label>
      </div>

      <div class="classes">
        <span class="muted small">Classes</span>
        @for (c of quickClasses; track c) {
          <button class="chip" [class.on]="selected().has(c)" (click)="toggleClass(c)"
                  [style.border-color]="selected().has(c) ? color(c) : ''">{{ c }}</button>
        }
        <select class="chip-select" [value]="''" (change)="addClass($event)">
          <option value="">more…</option>
          @for (c of allClasses; track c) { <option [value]="c">{{ c }}</option> }
        </select>
        @for (c of extraSelected(); track c) {
          <button class="chip on" (click)="toggleClass(c)" [style.border-color]="color(c)">{{ c }} ✕</button>
        }
      </div>

      <div class="row form-actions">
        <button (click)="run()" [disabled]="loading()">{{ loading() ? 'Searching…' : 'Search' }}</button>
        <button class="ghost" (click)="reset()">Reset</button>
        <label class="check"><input type="checkbox" [checked]="raw()" (change)="raw.set(!raw())" /> Raw sightings</label>
        <label class="check"><input type="checkbox" [checked]="showFrames()" (change)="showFrames.set(!showFrames())" /> Frames</label>
        <span class="grow"></span>
        @if (ran()) { <span class="muted small">{{ hits().length }} {{ raw() ? 'sightings' : 'events' }}</span> }
      </div>
      @if (error(); as e) { <p class="error small">{{ e }}</p> }
    </section>

    @if (counts().length) {
      <section class="panel">
        <h2>Totals for these filters</h2>
        <div class="row">
          @for (c of counts(); track c.className) {
            <button class="chip" (click)="only(c.className)" [style.border-color]="color(c.className)">
              {{ c.className }} <b>{{ c.count }}</b>
              <span class="muted small">{{ secs(c.firstSeconds) }}–{{ secs(c.lastSeconds) }}</span>
            </button>
          }
        </div>
        <p class="muted small">Counts are sightings per sampled frame, not unique objects. Two frames a second means a parked
          car counts twice a second it stays in view. For distinct objects, read the event count above.</p>
      </section>
    }

    @if (ran() && hits().length === 0 && !loading()) {
      <div class="panel empty"><p class="muted">Nothing matched those filters.</p></div>
    }

    <div class="hits" [class.no-frames]="!showFrames()">
      @for (h of hits(); track $index) {
        <article class="hit panel">
          @if (showFrames()) {
            <lens-frame [videoId]="h.videoId" [t]="h.bestSeconds" [box]="h" [label]="h.className" [className]="h.className" />
          }
          <div class="hit-body">
            <div class="row">
              <span class="tag" [style.border-color]="color(h.className)">{{ h.className }}</span>
              <b>{{ secs(h.timestampSeconds) }}</b>
              @if (!raw() && h.endSeconds > h.timestampSeconds) { <span class="muted">to {{ secs(h.endSeconds) }}</span> }
              <span class="grow"></span>
              <span class="muted small">{{ h.confidence * 100 | number: '1.0-0' }}%</span>
            </div>
            <div class="row small muted">
              <span>{{ h.camera }}</span>
              <span class="ellipsis">{{ h.videoName }}</span>
            </div>
            <div class="row small muted">
              <span [title]="full(h.occurredAt)">{{ clock(h.occurredAt) }}</span>
              @if (!raw()) { <span>· {{ h.count }} sighting{{ h.count === 1 ? '' : 's' }}</span> }
            </div>
          </div>
        </article>
      }
    </div>
  `,
})
export class SearchPage {
  private readonly api = inject(ApiService);

  readonly allClasses = COCO_CLASSES;
  readonly quickClasses = COMMON_CLASSES;

  readonly videos = signal<VideoInfo[]>([]);
  readonly hits = signal<DetectionHit[]>([]);
  readonly counts = signal<ClassCount[]>([]);
  readonly selected = signal<Set<string>>(new Set<string>());
  readonly loading = signal(false);
  readonly ran = signal(false);
  readonly error = signal<string | null>(null);
  readonly showFrames = signal(true);
  readonly raw = signal(false);

  readonly videoId = signal<number | null>(null);
  readonly camera = signal('');
  readonly fromSeconds = signal<number | null>(null);
  readonly toSeconds = signal<number | null>(null);
  readonly fromTime = signal('');
  readonly toTime = signal('');
  readonly minConfidence = signal(0.35);
  readonly minArea = signal(0);
  readonly group = signal(2);
  readonly limit = signal(50);

  readonly cameras = computed(() => [...new Set(this.videos().map((v) => v.camera))].sort());
  readonly totalIndexed = computed(() => this.videos().reduce((n, v) => n + v.detectionCount, 0));
  readonly extraSelected = computed(() => [...this.selected()].filter((c) => !COMMON_CLASSES.includes(c)));

  constructor() {
    void this.load();
  }

  color(name: string): string { return classColor(name); }
  secs(s: number): string { return fmtSeconds(s); }
  clock(iso: string): string { return fmtClock(iso); }
  full(iso: string): string { return fmtDateTime(iso); }

  toggleClass(c: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  addClass(ev: Event): void {
    const el = ev.target as HTMLSelectElement;
    if (el.value) this.toggleClass(el.value);
    el.value = '';
  }

  only(c: string): void {
    this.selected.set(new Set([c]));
    void this.run();
  }

  reset(): void {
    this.selected.set(new Set<string>());
    this.videoId.set(null);
    this.camera.set('');
    this.fromSeconds.set(null);
    this.toSeconds.set(null);
    this.fromTime.set('');
    this.toTime.set('');
    this.minConfidence.set(0.35);
    this.minArea.set(0);
    this.group.set(2);
    this.limit.set(50);
    this.hits.set([]);
    this.counts.set([]);
    this.ran.set(false);
  }

  private async load(): Promise<void> {
    try {
      this.videos.set(await firstValueFrom(this.api.videos()));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async run(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const classes = [...this.selected()];
    try {
      const [hits, counts] = await Promise.all([
        firstValueFrom(this.api.search({
          videoId: this.videoId(),
          camera: this.camera() || null,
          classes: classes.length ? classes : null,
          fromSeconds: this.fromSeconds(),
          toSeconds: this.toSeconds(),
          from: fromLocalInput(this.fromTime()),
          to: fromLocalInput(this.toTime()),
          minConfidence: this.minConfidence() > 0 ? this.minConfidence() : null,
          minArea: this.minArea() > 0 ? this.minArea() : null,
          limit: this.limit(),
          group: this.raw() ? 0 : this.group(),
        })),
        firstValueFrom(this.api.countsByClass({
          videoId: this.videoId(),
          classes: classes.length ? classes : null,
        })),
      ]);
      this.hits.set(hits);
      this.counts.set(counts);
      this.ran.set(true);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
      this.hits.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
