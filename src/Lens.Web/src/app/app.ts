import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LiveService } from './core/live.service';
import { StatusService } from './core/status.service';
import { fmtBytes } from './core/format';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/live"><span class="brand-mark"></span>Lens</a>
      <nav class="nav">
        <a routerLink="/live" routerLinkActive="active">Live</a>
        <a routerLink="/cameras" routerLinkActive="active">Cameras</a>
        <a routerLink="/search" routerLinkActive="active">Search</a>
        <a routerLink="/ask" routerLinkActive="active">Ask</a>
        <a routerLink="/videos" routerLinkActive="active">Videos</a>
      </nav>
      <div class="topbar-status">
        <span class="pill" [class.ok]="live.state() === 'connected'" [class.warn]="live.state() === 'reconnecting' || live.state() === 'connecting'"
              title="Live detection feed over SignalR">
          <span class="dot"></span>feed {{ live.state() }}
        </span>
        @if (status.status(); as st) {
          <span class="pill" [class.ok]="st.mediamtx.available" title="WebRTC gateway used for live playback">
            <span class="dot"></span>MediaMTX {{ st.mediamtx.available ? 'up' : 'down' }}
          </span>
          <span class="muted small">{{ st.sources.length }} cameras · {{ activeJobs() }} indexing · {{ archive() }} archived</span>
        } @else if (status.error()) {
          <span class="pill bad" [title]="status.error() ?? ''"><span class="dot"></span>API unreachable</span>
        }
      </div>
    </header>
    <main class="page">
      <router-outlet />
    </main>
  `,
})
export class App {
  readonly live = inject(LiveService);
  readonly status = inject(StatusService);

  readonly activeJobs = computed(() =>
    (this.status.status()?.jobs ?? []).filter((j) => j.status === 'queued' || j.status === 'running').length);
  readonly archive = computed(() => fmtBytes(this.status.status()?.framesArchiveBytes ?? 0));

  constructor() {
    this.live.ensureStarted();
    this.status.start(2000);
  }
}
