import { Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DecisionEvent {
  blockId: string;
  timestamp: string | null;
  decision: any | null;
}

@Injectable({
  providedIn: 'root'
})
export class DecisionEventsService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  constructor(private zone: NgZone) {}

  watchBlock(blockId: string): Observable<DecisionEvent> {
    return new Observable<DecisionEvent>(observer => {
      if (typeof EventSource === 'undefined') {
        observer.complete();
        return undefined;
      }

      const streamUrl = `${this.baseUrl}/api/blocks/${encodeURIComponent(blockId)}/decision-events`;
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
        // EventSource retries automatically.
      };

      return () => {
        eventSource.close();
      };
    });
  }

  private parseEvent(payload: string): DecisionEvent | null {
    try {
      const candidate = JSON.parse(payload) as {
        block_id?: unknown;
        timestamp?: unknown;
        decision?: unknown;
      };

      if (!candidate.block_id) {
        return null;
      }

      return {
        blockId: String(candidate.block_id),
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : null,
        decision: candidate.decision && typeof candidate.decision === 'object' ? candidate.decision : null
      };
    } catch {
      return null;
    }
  }
}
