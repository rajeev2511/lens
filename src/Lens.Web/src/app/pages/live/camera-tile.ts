import {
  AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { LiveService } from '../../core/live.service';
import { ApiService } from '../../core/api.service';
import { LiveEvent, SourceSnapshot } from '../../core/models';
import { classColor } from '../../core/coco';
import { entriesDesc, timeAgo } from '../../core/format';
import { WhepPlayer } from '../../core/whep';

type Player = 'webrtc' | 'mjpeg' | 'none';

/**
 * One camera in the wall. Playback comes from MediaMTX over WebRTC when it is available, otherwise from
 * Lens's own MJPEG endpoint. Detections arrive over SignalR and are drawn on a canvas above the picture,
 * held back by the camera's overlay offset so the boxes line up with what the viewer is seeing.
 */
@Component({
  selector: 'lens-camera-tile',
  imports: [DecimalPipe],
  template: `
    <div class="tile" [class.expanded]="expanded()" [class.offline]="source().status !== 'running'">
      <div class="tile-media" (click)="expand.emit(source().id)">
        @if (player() === 'webrtc') {
          <video #video muted playsinline></video>
        } @else if (player() === 'mjpeg') {
          <img #shot [src]="mjpeg()" alt="{{ source().name }} live view" (error)="mjpegFailed.set(true)" />
        } @else {
          <div class="tile-empty">no playback available</div>
        }
        <canvas #overlay class="tile-overlay"></canvas>

        <div class="tile-top">
          <span class="dot {{ source().status }}"></span>
          <b>{{ source().name }}</b>
          <span class="muted small">{{ source().camera }}</span>
          <span class="grow"></span>
          <span class="tag">{{ player() === 'webrtc' ? 'WebRTC' : player() === 'mjpeg' ? 'MJPEG' : '-' }}</span>
        </div>

        @if (source().status !== 'running') {
          <div class="tile-state">
            <div>{{ stateText() }}</div>
            @if (source().lastError; as err) { <div class="small error">{{ err }}</div> }
          </div>
        }

        <div class="tile-bottom">
          <span>{{ source().measuredFps | number: '1.0-1' }} fps</span>
          <span>{{ source().inferenceMs | number: '1.0-0' }} ms</span>
          <span>{{ source().detections }} det</span>
          <span class="grow"></span>
          @for (c of recent(); track c.key) {
            <span class="tag" [style.border-color]="color(c.key)">{{ c.key }} {{ c.value }}</span>
          }
        </div>
      </div>
    </div>
  `,
})
export class CameraTile implements AfterViewInit, OnDestroy {
  private readonly live = inject(LiveService);
  private readonly api = inject(ApiService);

  readonly source = input.required<SourceSnapshot>();
  readonly webrtcBase = input<string>('');
  readonly mediamtxUp = input<boolean>(false);
  readonly expanded = input<boolean>(false);
  readonly expand = output<number>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('overlay');

  readonly mjpegFailed = signal(false);
  private whep: WhepPlayer | null = null;
  private whepUrl = '';
  private sub: Subscription | null = null;
  private raf = 0;
  private resize: ResizeObserver | null = null;
  /** Recent events waiting out the overlay offset before they are drawn. */
  private pending: LiveEvent[] = [];

  readonly player = computed<Player>(() => {
    const s = this.source();
    if (s.webrtcPath && this.mediamtxUp() && this.webrtcBase()) return 'webrtc';
    return s.status === 'running' || s.status === 'connecting' ? 'mjpeg' : 'none';
  });

  readonly mjpeg = computed(() => this.api.mjpegUrl(this.source().id));
  readonly recent = computed(() => entriesDesc(this.source().recent).slice(0, 4));

  readonly stateText = computed(() => {
    const s = this.source();
    if (s.status === 'disabled') return 'paused';
    if (s.status === 'reconnecting') return `reconnecting, attempt ${s.attempts}${s.nextRetryAt ? ' ' + timeAgo(s.nextRetryAt) : ''}`;
    if (s.status === 'connecting') return 'connecting to the stream';
    if (s.status === 'stopped') return 'stopped';
    return '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.teardown());
    // Re-attach the player whenever the chosen transport or its URL changes.
    effect(() => {
      const want = this.player() === 'webrtc' ? `${this.webrtcBase()}/${this.source().webrtcPath}/whep` : '';
      if (want === this.whepUrl) return;
      this.whepUrl = want;
      this.whep?.close();
      this.whep = null;
      if (want) queueMicrotask(() => this.startWhep(want));
    });
  }

  ngAfterViewInit(): void {
    this.sub = this.live.events.subscribe((e) => {
      if (e.sourceId !== this.source().id) return;
      this.pending.push(e);
      if (this.pending.length > 60) this.pending.shift();
    });
    const canvas = this.canvas()?.nativeElement;
    if (canvas) {
      this.resize = new ResizeObserver(() => this.size(canvas));
      this.resize.observe(canvas);
      this.size(canvas);
    }
    this.loop();
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  color(name: string): string {
    return classColor(name);
  }

  private async startWhep(url: string): Promise<void> {
    const el = this.video()?.nativeElement;
    if (!el) return;
    const player = new WhepPlayer(el, url);
    this.whep = player;
    try {
      await player.start();
    } catch {
      // MediaMTX has no publisher on this path yet; the status line already tells the viewer.
    }
  }

  private teardown(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.sub?.unsubscribe();
    this.sub = null;
    this.resize?.disconnect();
    this.resize = null;
    this.whep?.close();
    this.whep = null;
  }

  private size(canvas: HTMLCanvasElement): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /**
   * Draws the newest event that is already older than the overlay offset, and keeps it up for a short while.
   * Boxes line up within a few hundred milliseconds, not frame-exact; archived frames in Search are exact.
   */
  private loop = (): void => {
    const canvas = this.canvas()?.nativeElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const offset = this.source().overlayOffsetMs;
        const now = performance.now();
        let show: LiveEvent | null = null;
        for (const e of this.pending) {
          if (now - e.receivedAt >= offset) show = e;
        }
        // Drop anything already shown, keeping the last one so the boxes persist between frames.
        if (show) {
          const keepFrom = this.pending.indexOf(show);
          if (keepFrom > 0) this.pending = this.pending.slice(keepFrom);
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (show && now - show.receivedAt < offset + 1500) this.draw(ctx, canvas, show);
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, e: LiveEvent): void {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width;
    const H = canvas.height;
    ctx.lineWidth = Math.max(1.5, 2 * dpr);
    ctx.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';

    for (const d of e.detections) {
      const x = d.x1 * W;
      const y = d.y1 * H;
      const w = (d.x2 - d.x1) * W;
      const h = (d.y2 - d.y1) * H;
      const color = classColor(d.className);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);

      const text = `${d.className} ${Math.round(d.confidence * 100)}%`;
      const tw = ctx.measureText(text).width + 8 * dpr;
      const th = 15 * dpr;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - th), tw, th);
      ctx.fillStyle = '#06080c';
      ctx.fillText(text, x + 4 * dpr, Math.max(0, y - th) + 2 * dpr);
    }
  }
}
