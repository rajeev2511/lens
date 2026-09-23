import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CameraTile } from './camera-tile';
import { LiveService } from '../../core/live.service';
import { StatusService } from '../../core/status.service';
import { classColor } from '../../core/coco';
import { fmtClock, fmtSeconds } from '../../core/format';

/** The camera wall: 1 to 16 tiles with live boxes, plus the merged detection feed from every camera. */
@Component({
  selector: 'lens-live',
  imports: [CameraTile, RouterLink, DecimalPipe, FormsModule],
  template: `
    <div class="page-head">
      <h1>Live</h1>
      <div class="row">
        <label class="field">
          <span>Tiles</span>
          <select [(ngModel)]="tiles" name="tiles">
            @for (n of tileChoices; track n) { <option [ngValue]="n">{{ n }}</option> }
          </select>
        </label>
        <label class="field">
          <span>Camera</span>
          <select [(ngModel)]="cameraFilter" name="camera">
            <option [ngValue]="''">all cameras</option>
            @for (c of cameras(); track c) { <option [ngValue]="c">{{ c }}</option> }
          </select>
        </label>
        <label class="check"><input type="checkbox" [checked]="showFeed()" (change)="showFeed.set(!showFeed())" /> Feed</label>
      </div>
    </div>

    @if (sources().length === 0) {
      <div class="panel empty">
        <p>No cameras yet.</p>
        <p class="muted">Add an RTSP, RTMP or HTTP stream on the <a routerLink="/cameras">Cameras</a> page. A local video file
          works too: Lens reads it at real-time pace and loops it, which is handy for testing without hardware.</p>
      </div>
    } @else {
      <div class="live-layout" [class.with-feed]="showFeed()">
        <div class="wall" [style.grid-template-columns]="columns()">
          @for (s of visible(); track s.id) {
            <lens-camera-tile
              [source]="s"
              [webrtcBase]="webrtcBase()"
              [mediamtxUp]="mediamtxUp()"
              [expanded]="expandedId() === s.id"
              (expand)="toggleExpand($event)" />
          }
        </div>

        @if (showFeed()) {
          <aside class="feed panel">
            <div class="row feed-head">
              <h2>Detection feed</h2>
              <span class="grow"></span>
              <span class="muted small">{{ live.received() }} events</span>
              <button class="ghost small" (click)="live.clearFeed()">Clear</button>
            </div>
            @if (feed().length === 0) {
              <p class="muted small">Waiting for detections. Every sampled frame that contains an object appears here.</p>
            }
            <ul class="feed-list">
              @for (e of feed(); track $index) {
                <li>
                  <span class="feed-time">{{ clock(e.occurredAt) }}</span>
                  <span class="feed-cam">{{ e.name }}</span>
                  <span class="feed-classes">
                    @for (d of e.detections; track $index) {
                      <span class="tag" [style.border-color]="color(d.className)">{{ d.className }} {{ d.confidence * 100 | number: '1.0-0' }}%</span>
                    }
                  </span>
                  <span class="muted small">{{ seconds(e.timestampSeconds) }}</span>
                </li>
              }
            </ul>
          </aside>
        }
      </div>
    }
  `,
})
export class LivePage {
  readonly live = inject(LiveService);
  private readonly status = inject(StatusService);

  readonly tileChoices = [1, 2, 4, 6, 9, 12, 16];
  readonly tiles = signal(4);
  readonly cameraFilter = signal('');
  readonly showFeed = signal(true);
  readonly expandedId = signal<number | null>(null);

  readonly sources = computed(() => this.status.status()?.sources ?? []);
  readonly mediamtxUp = computed(() => this.status.status()?.mediamtx.available ?? false);
  readonly webrtcBase = computed(() => this.status.status()?.mediamtx.webrtcBaseUrl ?? '');
  readonly cameras = computed(() => [...new Set(this.sources().map((s) => s.camera))].sort());

  readonly visible = computed(() => {
    const filter = this.cameraFilter();
    const list = this.sources().filter((s) => !filter || s.camera === filter);
    const expanded = this.expandedId();
    if (expanded !== null) {
      const one = list.filter((s) => s.id === expanded);
      if (one.length) return one;
    }
    return list.slice(0, this.tiles());
  });

  readonly columns = computed(() => {
    if (this.expandedId() !== null) return '1fr';
    const n = Math.min(this.tiles(), Math.max(1, this.visible().length));
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
    return `repeat(${cols}, minmax(0, 1fr))`;
  });

  readonly feed = computed(() => {
    const filter = this.cameraFilter();
    const all = this.live.feed();
    return (filter ? all.filter((e) => e.camera === filter) : all).slice(0, 60);
  });

  toggleExpand(id: number): void {
    this.expandedId.update((cur) => (cur === id ? null : id));
  }

  color(name: string): string {
    return classColor(name);
  }

  clock(iso: string): string {
    return fmtClock(iso);
  }

  seconds(s: number): string {
    return fmtSeconds(s);
  }
}
