import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type SatelliteRefreshEventName = 'connected' | 'queued' | 'running' | 'completed' | 'failed';

export interface SatelliteRefreshEvent {
  blockId: string;
  event: SatelliteRefreshEventName;
  timestamp: string | null;
  reason: string;
  dataQuality: string | null;
  error: string | null;
  latencyMs: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class SatelliteRefreshEventsService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private zone: NgZone) {}

  watchBlock(blockId: string): Observable<SatelliteRefreshEvent> {
    return new Observable<SatelliteRefreshEvent>(observer => {
      if (typeof EventSource === 'undefined') {
        observer.complete();
        return undefined;
      }

      const streamUrl = `${this.baseUrl}/api/blocks/${encodeURIComponent(blockId)}/events`;
      const eventSource = new EventSource(streamUrl);

      eventSource.onmessage = message => {
        this.zone.run(() => {
          const event = this.parseEvent(message.data);
          if (event) {
            observer.next(event);
          }
        });
      };

      eventSource.onerror = () => {
        // EventSource will retry automatically. The dashboard keeps the last successful state until a new event arrives.
      };

      return () => {
        eventSource.close();
      };
    });
  }

  private parseEvent(payload: string): SatelliteRefreshEvent | null {
    try {
      const candidate = JSON.parse(payload) as {
        block_id?: unknown;
        event?: unknown;
        timestamp?: unknown;
        reason?: unknown;
        data_quality?: unknown;
        error?: unknown;
        latency_ms?: unknown;
      };

      if (!candidate.block_id || !candidate.event || !candidate.reason) {
        return null;
      }

      return {
        blockId: String(candidate.block_id),
        event: this.normalizeEvent(candidate.event),
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : null,
        reason: String(candidate.reason),
        dataQuality: typeof candidate.data_quality === 'string' ? candidate.data_quality : null,
        error: typeof candidate.error === 'string' ? candidate.error : null,
        latencyMs: typeof candidate.latency_ms === 'number' ? candidate.latency_ms : null
      };
    } catch {
      return null;
    }
  }

  private normalizeEvent(value: unknown): SatelliteRefreshEventName {
    switch (value) {
      case 'queued':
      case 'running':
      case 'completed':
      case 'failed':
        return value;
      default:
        return 'connected';
    }
  }
}
