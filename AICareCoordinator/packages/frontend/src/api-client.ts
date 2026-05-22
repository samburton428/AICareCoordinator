import type {
  ConversationSession,
  ConversationResponse,
  ExtractionResult,
  TriageResult,
  RoutingRecommendation,
  PatientRecord,
} from '@ai-care-coordinator/shared';

/**
 * API client for the AI Care Coordinator backend.
 *
 * Usage:
 *   const client = new ApiClient('/api');       // proxied via Vite
 *   const client = new ApiClient('https://xyz.execute-api.us-east-1.amazonaws.com/prod');
 *
 * The demo dashboard defaults to mock mode (no real API calls).
 * To switch to API mode, see the comment in App.tsx.
 */
export class ApiClient {
  constructor(private baseUrl: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api') {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });

    const body = await res.json();

    if (!res.ok) {
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string }).message
          : `Request failed with status ${res.status}`;
      throw new Error(message);
    }

    return body as T;
  }

  // ── session ──────────────────────────────────────────────────────────────

  async initSession(): Promise<ConversationSession> {
    return this.request<ConversationSession>('/session', { method: 'POST' });
  }

  async sendMessage(sessionId: string, message: string): Promise<ConversationResponse> {
    return this.request<ConversationResponse>(
      `/session/${encodeURIComponent(sessionId)}/message`,
      { method: 'POST', body: JSON.stringify({ message }) },
    );
  }

  // ── pipeline stages ──────────────────────────────────────────────────────

  async extractEntities(sessionId: string): Promise<ExtractionResult> {
    return this.request<ExtractionResult>(
      `/session/${encodeURIComponent(sessionId)}/extract`,
      { method: 'POST' },
    );
  }

  async assessUrgency(sessionId: string): Promise<TriageResult> {
    return this.request<TriageResult>(
      `/session/${encodeURIComponent(sessionId)}/triage`,
      { method: 'POST' },
    );
  }

  async routePatient(sessionId: string): Promise<RoutingRecommendation> {
    return this.request<RoutingRecommendation>(
      `/session/${encodeURIComponent(sessionId)}/route`,
      { method: 'POST' },
    );
  }

  // ── read ──────────────────────────────────────────────────────────────────

  async getSession(sessionId: string): Promise<PatientRecord | null> {
    try {
      return await this.request<PatientRecord>(
        `/session/${encodeURIComponent(sessionId)}`,
        { method: 'GET' },
      );
    } catch (error: unknown) {
      // 404 → null, anything else re-throw
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }
}
