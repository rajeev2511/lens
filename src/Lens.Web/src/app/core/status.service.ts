import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { LensStatus } from './models';
import { errorMessage } from './errors';

/** Polls /api/status so every page shares one picture of sources, jobs and MediaMTX. */
@Injectable({ providedIn: 'root' })
export class StatusService {
  private readonly api = inject(ApiService);
  readonly status = signal<LensStatus | null>(null);
  readonly error = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  start(intervalMs = 2000): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async refresh(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      this.status.set(await firstValueFrom(this.api.status()));
      this.error.set(null);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.inFlight = false;
    }
  }
}
