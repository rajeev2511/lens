import { Component, computed, inject, input, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { Box } from '../core/models';
import { classColor } from '../core/coco';

/**
 * A still from /api/frame with one box drawn over it. The box is placed in percent, so it tracks the
 * image at any size. Boxes are normalised 0..1 of the source frame by the detector.
 */
@Component({
  selector: 'lens-frame',
  template: `
    <div class="frame">
      <img [src]="src()" [alt]="label()" loading="lazy" (load)="loaded.set(true)" (error)="failed.set(true)" />
      @if (box(); as b) {
        <div class="frame-box" [class.label-inside]="b.y1 < 0.06"
             [style.left.%]="b.x1 * 100" [style.top.%]="b.y1 * 100"
             [style.width.%]="(b.x2 - b.x1) * 100" [style.height.%]="(b.y2 - b.y1) * 100"
             [style.border-color]="color()">
          @if (label()) { <span class="frame-box-label" [style.background]="color()">{{ label() }}</span> }
        </div>
      }
      @if (failed()) { <div class="frame-missing">no frame stored for this moment</div> }
    </div>
  `,
})
export class FrameView {
  private readonly api = inject(ApiService);
  readonly videoId = input.required<number>();
  readonly t = input.required<number>();
  readonly box = input<Box | null>(null);
  readonly label = input<string>('');
  readonly className = input<string>('');

  readonly loaded = signal(false);
  readonly failed = signal(false);
  readonly src = computed(() => this.api.frameUrl(this.videoId(), this.t()));
  readonly color = computed(() => classColor(this.className()));
}
