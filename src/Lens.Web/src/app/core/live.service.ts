import { Injectable, NgZone, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { LiveEvent } from './models';

export type FeedState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * One SignalR connection to /hubs/live for the whole app. The server pushes a "detection" message for every
 * sampled frame that had boxes. Tiles subscribe to the stream; the merged feed keeps the most recent events.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly zone = inject(NgZone);
  private conn: HubConnection | null = null;

  readonly state = signal<FeedState>('disconnected');
  /** Every event as it arrives, for the canvases that draw boxes. */
  readonly events = new Subject<LiveEvent>();
  /** Newest first and capped, for the merged feed list. */
  readonly feed = signal<LiveEvent[]>([]);
  readonly received = signal(0);

  ensureStarted(): void {
    if (this.conn) return;
    const conn = new HubConnectionBuilder()
      .withUrl('/hubs/live')
      .withAutomaticReconnect([0, 1000, 3000, 5000, 10000, 10000, 10000])
      .configureLogging(LogLevel.Warning)
      .build();
    this.conn = conn;

    conn.on('detection', (raw: Omit<LiveEvent, 'receivedAt'>) => {
      const e: LiveEvent = { ...raw, receivedAt: performance.now() };
      this.events.next(e);
      this.zone.run(() => {
        this.received.update((n) => n + 1);
        this.feed.update((list) => {
          const next = [e, ...list];
          return next.length > 200 ? next.slice(0, 200) : next;
        });
      });
    });
    conn.onreconnecting(() => this.zone.run(() => this.state.set('reconnecting')));
    conn.onreconnected(() => this.zone.run(() => this.state.set('connected')));
    conn.onclose(() => {
      this.zone.run(() => this.state.set('disconnected'));
      setTimeout(() => this.start(), 5000);
    });
    this.start();
  }

  clearFeed(): void {
    this.feed.set([]);
  }

  private start(): void {
    const conn = this.conn;
    if (!conn || conn.state !== HubConnectionState.Disconnected) return;
    this.state.set('connecting');
    conn.start()
      .then(() => this.zone.run(() => this.state.set('connected')))
      .catch(() => {
        this.zone.run(() => this.state.set('disconnected'));
        setTimeout(() => this.start(), 5000);
      });
  }
}
