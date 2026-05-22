import React, { useState, useCallback, useEffect } from 'react';
import type {
  ConversationTranscript,
  ConversationResponse,
  TranscriptMessage,
  ClinicalEntity,
  TriageResult,
  RoutingRecommendation,
} from '@ai-care-coordinator/shared';
import { StageIndicator } from './StageIndicator.js';
import { ChatInterface } from './ChatInterface.js';
import { EntityView } from './EntityView.js';
import { TriageView } from './TriageView.js';
import { RoutingView } from './RoutingView.js';

import { ApiClient } from './api-client.js';
const apiClient = new ApiClient();

export type StageName =
  | 'symptom-collection'
  | 'clinical-extraction'
  | 'urgency-assessment'
  | 'care-routing';

const STAGE_NAMES: string[] = [
  'Symptom Collection',
  'Clinical Extraction',
  'Urgency Assessment',
  'Care Routing',
];

const STAGE_ORDER: StageName[] = [
  'symptom-collection',
  'clinical-extraction',
  'urgency-assessment',
  'care-routing',
];

export function App() {
  const [currentStage, setCurrentStage] = useState<number>(1);
  const [transcript, setTranscript] = useState<ConversationTranscript | null>(null);
  const [extractedEntities, setExtractedEntities] = useState<ClinicalEntity[] | null>(null);
  const [requiresManualReview, setRequiresManualReview] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [routingRecommendation, setRoutingRecommendation] =
    useState<RoutingRecommendation | null>(null);

  // Chat state
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    let cancelled = false;
    apiClient.initSession().then((session) => {
      if (cancelled) return;
      setSessionId(session.sessionId);
      setMessages([
        {
          role: 'assistant' as const,
          content: session.greeting,
          timestamp: new Date().toISOString(),
        },
      ]);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error('Failed to init session:', err);
      setMessages([
        {
          role: 'assistant' as const,
          content: 'Sorry, I could not connect to the server. Please try again later.',
          timestamp: new Date().toISOString(),
        },
      ]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Auto-run pipeline stages via API when entering stages 2, 3, 4
  useEffect(() => {
    if (!sessionId) return;
    if (currentStage === 2 && !extractedEntities) {
      apiClient.extractEntities(sessionId).then((result) => {
        setExtractedEntities(result.entities);
        setRequiresManualReview(result.requiresManualReview);
      }).catch((err) => console.error('Extraction failed:', err));
    }
    if (currentStage === 3 && !triageResult) {
      apiClient.assessUrgency(sessionId).then((result) => {
        setTriageResult(result);
      }).catch((err) => console.error('Triage failed:', err));
    }
    if (currentStage === 4 && !routingRecommendation) {
      apiClient.routePatient(sessionId).then((result) => {
        setRoutingRecommendation(result);
      }).catch((err) => console.error('Routing failed:', err));
    }
  }, [currentStage, sessionId, extractedEntities, triageResult, routingRecommendation]);

  const handleSendMessage = useCallback(
    async (message: string): Promise<ConversationResponse> => {
      const patientMsg: TranscriptMessage = {
        role: 'patient',
        content: message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, patientMsg]);

      const response = await apiClient.sendMessage(sessionId, message);

      const assistantMsg: TranscriptMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (response.isComplete && response.summary) {
        setIsComplete(true);
        setSummary(response.summary);
      }

      return response;
    },
    [sessionId],
  );

  const handleConversationComplete = useCallback(
    (completedTranscript: ConversationTranscript) => {
      setTranscript(completedTranscript);
      setCurrentStage(2);
    },
    [],
  );

  const advanceStage = useCallback(() => {
    setCurrentStage((prev) => Math.min(prev + 1, STAGE_ORDER.length));
  }, []);

  const resetSession = useCallback(() => {
    setCurrentStage(1);
    setTranscript(null);
    setExtractedEntities(null);
    setRequiresManualReview(false);
    setTriageResult(null);
    setRoutingRecommendation(null);
    setIsComplete(false);
    setSummary(null);
    setLoading(true);
    apiClient.initSession().then((session) => {
      setSessionId(session.sessionId);
      setMessages([
        {
          role: 'assistant' as const,
          content: session.greeting,
          timestamp: new Date().toISOString(),
        },
      ]);
      setLoading(false);
    }).catch((err) => {
      console.error('Failed to init session:', err);
      setLoading(false);
    });
  }, []);

  const currentStageName = STAGE_ORDER[currentStage - 1];

  return (
    <div className="app-container">
      <header className="app-header">
        <span className="header-icon">🏥</span>
        <h1>AI Care Coordinator</h1>
        <span className="header-icon">💬</span>
      </header>

      <StageIndicator currentStage={currentStage} stageNames={STAGE_NAMES} />

      <main>
        {currentStageName === 'symptom-collection' && (
          <section data-testid="stage-symptom-collection" className="card">
            <div className="card-header">💬 Symptom Collection</div>
            {loading ? (
              <p className="loading-text">Connecting to care coordinator...</p>
            ) : (
              <ChatInterface
                messages={messages}
                isComplete={isComplete}
                summary={summary}
                onSendMessage={handleSendMessage}
                onComplete={handleConversationComplete}
                sessionId={sessionId}
              />
            )}
          </section>
        )}

        {currentStageName === 'clinical-extraction' && (
          <section data-testid="stage-clinical-extraction" className="card">
            <div className="card-header">🔬 Clinical Extraction</div>
            {extractedEntities ? (
              <EntityView
                entities={extractedEntities}
                requiresManualReview={requiresManualReview}
              />
            ) : (
              <p className="loading-text">Extracting clinical entities...</p>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={advanceStage}
                data-testid="continue-button"
                className="btn-primary"
              >
                Continue to Urgency Assessment →
              </button>
            </div>
          </section>
        )}

        {currentStageName === 'urgency-assessment' && (
          <section data-testid="stage-urgency-assessment" className="card">
            <div className="card-header">⚡ Urgency Assessment</div>
            {triageResult ? (
              <TriageView triageResult={triageResult} />
            ) : (
              <p className="loading-text">Assessing urgency level...</p>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={advanceStage}
                data-testid="continue-button"
                className="btn-primary"
              >
                Continue to Care Routing →
              </button>
            </div>
          </section>
        )}

        {currentStageName === 'care-routing' && (
          <section data-testid="stage-care-routing" className="card">
            <div className="card-header">🗺️ Care Routing</div>
            {routingRecommendation ? (
              <RoutingView routingRecommendation={routingRecommendation} />
            ) : (
              <p className="loading-text">Determining care pathway...</p>
            )}
          </section>
        )}
      </main>

      <div className="app-footer">
        <button
          onClick={resetSession}
          data-testid="reset-button"
          className="btn-secondary"
        >
          ↻ Start New Session
        </button>
      </div>
    </div>
  );
}
