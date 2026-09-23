import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AskResult, VideoInfo } from '../../core/models';
import { errorMessage } from '../../core/errors';
import { classColor } from '../../core/coco';
import { fmtClock, fmtSeconds } from '../../core/format';
import { FrameView } from '../../shared/frame-view';

/**
 * The question box. It posts to /api/ask, where a Claude tool-use agent turns the sentence into store queries.
 * The agent needs ANTHROPIC_API_KEY on the server; without it the API answers 503 and this page says so and
 * points at Search, which needs no key.
 */
@Component({
  selector: 'lens-ask',
  imports: [FormsModule, FrameView, RouterLink, DecimalPipe],
  template: `
    <div class="page-head">
      <h1>Ask</h1>
      <span class="muted small">Plain English over the detection store. Every tool call the agent makes is shown below the answer.</span>
    </div>

    <section class="panel">
      <div class="row ask-row">
        <input class="grow ask-input" [(ngModel)]="question" name="q" placeholder="when was the first bus seen?"
               (keyup.enter)="ask()" [disabled]="loading()" maxlength="1000" />
        <select [(ngModel)]="videoId" name="scope" [disabled]="loading()">
          <option [ngValue]="null">all videos</option>
          @for (v of videos(); track v.id) { <option [ngValue]="v.id">#{{ v.id }} {{ v.name }}</option> }
        </select>
        <button (click)="ask()" [disabled]="loading() || !question().trim()">{{ loading() ? 'Thinking…' : 'Ask' }}</button>
      </div>
      <div class="row suggestions">
        <span class="muted small">Try</span>
        @for (s of samples; track s) { <button class="chip" (click)="use(s)" [disabled]="loading()">{{ s }}</button> }
      </div>
    </section>

    @if (unavailable()) {
      <section class="panel notice-panel">
        <h2>The question box is switched off</h2>
        <p>{{ error() }}</p>
        <p class="muted">Indexing and direct search never call out to a model, so they keep working. Use
          <a routerLink="/search">Search</a> to filter by class, camera, time window and confidence, and read the
          totals per class there. To turn this page on, set <code>ANTHROPIC_API_KEY</code> in the environment the API
          runs in and restart it.</p>
      </section>
    } @else if (error(); as e) {
      <section class="panel"><p class="error">{{ e }}</p></section>
    }

    @if (result(); as r) {
      <section class="panel answer">
        <h2>Answer</h2>
        <p class="answer-text">{{ r.answer }}</p>
        <div class="row small muted">
          <span>{{ r.toolCalls.length }} tool call{{ r.toolCalls.length === 1 ? '' : 's' }}</span>
          <span>· {{ r.inputTokens }} in / {{ r.outputTokens }} out tokens</span>
          <span>· stopped: {{ r.stopReason }}</span>
        </div>
      </section>

      @if (r.toolCalls.length) {
        <section class="panel">
          <h2>What it looked at</h2>
          <ol class="trace">
            @for (t of r.toolCalls; track $index) {
              <li>
                <div class="row">
                  <b class="mono">{{ t.tool }}</b>
                  <span class="grow"></span>
                  <span class="muted small">{{ t.ms | number: '1.0-0' }} ms · {{ t.resultChars }} chars back</span>
                </div>
                <pre class="mono small">{{ pretty(t.input) }}</pre>
              </li>
            }
          </ol>
        </section>
      }

      @if (r.hits.length) {
        <h2 class="section-title">Matching frames</h2>
        <div class="hits">
          @for (h of r.hits; track $index) {
            <article class="hit panel">
              <lens-frame [videoId]="h.videoId" [t]="h.bestSeconds" [box]="h" [label]="h.className" [className]="h.className" />
              <div class="hit-body">
                <div class="row">
                  <span class="tag" [style.border-color]="color(h.className)">{{ h.className }}</span>
                  <b>{{ secs(h.timestampSeconds) }}</b>
                  <span class="grow"></span>
                  <span class="muted small">{{ h.confidence * 100 | number: '1.0-0' }}%</span>
                </div>
                <div class="row small muted">
                  <span>{{ h.camera }}</span><span>·</span><span>{{ clock(h.occurredAt) }}</span>
                </div>
              </div>
            </article>
          }
        </div>
      }
    }
  `,
})
export class AskPage {
  private readonly api = inject(ApiService);

  readonly samples = [
    'when was the first bus seen?',
    'how many trucks passed in the first 30 seconds?',
    'show me people after 6pm',
    'which camera saw the most cars?',
  ];

  readonly question = signal('');
  readonly videoId = signal<number | null>(null);
  readonly videos = signal<VideoInfo[]>([]);
  readonly result = signal<AskResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** 503 from the API: no key is configured, which is a normal state, not a failure. */
  readonly unavailable = signal(false);

  constructor() {
    void this.load();
  }

  color(name: string): string { return classColor(name); }
  secs(s: number): string { return fmtSeconds(s); }
  clock(iso: string): string { return fmtClock(iso); }

  pretty(input: unknown): string {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  }

  use(s: string): void {
    this.question.set(s);
    void this.ask();
  }

  private async load(): Promise<void> {
    try {
      this.videos.set(await firstValueFrom(this.api.videos()));
    } catch {
      // The videos list is only used to scope the question; Search reports API trouble.
    }
  }

  async ask(): Promise<void> {
    const q = this.question().trim();
    if (!q || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.unavailable.set(false);
    this.result.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.ask(q, this.videoId())));
    } catch (e) {
      this.error.set(errorMessage(e));
      if (e instanceof HttpErrorResponse && e.status === 503) this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
