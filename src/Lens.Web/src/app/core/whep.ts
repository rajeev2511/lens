/**
 * Minimal WHEP client for MediaMTX: POST an SDP offer to http://host:8889/<path>/whep, apply the answer, play.
 * Non-trickle, so it waits for ICE gathering and the offer carries every candidate. Same host, no TURN needed.
 */
export class WhepPlayer {
  private pc: RTCPeerConnection | null = null;
  private sessionUrl: string | null = null;
  private closed = false;

  onStateChange: ((state: RTCPeerConnectionState) => void) | null = null;

  constructor(private readonly video: HTMLVideoElement, private readonly url: string) {}

  async start(): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
    this.pc = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = (ev) => {
      const stream = ev.streams.length ? ev.streams[0] : this.attach(ev.track);
      if (this.video.srcObject !== stream) this.video.srcObject = stream;
    };
    pc.onconnectionstatechange = () => this.onStateChange?.(pc.connectionState);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIce(pc, 1500);
    if (this.closed) return;

    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp ?? offer.sdp ?? '',
    });
    if (!res.ok) throw new Error(`WHEP ${res.status} ${res.statusText}`);
    const location = res.headers.get('Location');
    this.sessionUrl = location ? new URL(location, this.url).toString() : null;
    const answer = await res.text();
    if (this.closed) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    // Chrome's autoplay policy needs muted as a *property* before play(); the template attribute alone leaves the tile black.
    this.video.muted = true;
    this.video.playsInline = true;
    try {
      await this.video.play();
    } catch {
      // Autoplay refused. The tile stays paused until the viewer clicks it.
    }
  }

  close(): void {
    this.closed = true;
    const pc = this.pc;
    this.pc = null;
    pc?.close();
    if (this.sessionUrl) void fetch(this.sessionUrl, { method: 'DELETE' }).catch(() => undefined);
    this.sessionUrl = null;
    this.video.srcObject = null;
  }

  private attach(track: MediaStreamTrack): MediaStream {
    const existing = this.video.srcObject instanceof MediaStream ? this.video.srcObject : new MediaStream();
    existing.addTrack(track);
    return existing;
  }

  private waitForIce(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => { if (pc.iceGatheringState === 'complete') done(); };
      const timer = setTimeout(done, timeoutMs);
      pc.addEventListener('icegatheringstatechange', check);
    });
  }
}
