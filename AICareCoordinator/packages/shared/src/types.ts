// ── Entity & Extraction Types ────────────────────────────────────────────────

/**
 * Category classification for clinical entities extracted from patient text.
 * Maps to Amazon Comprehend Medical entity types.
 */
export type EntityCategory =
  | 'SYMPTOM'
  | 'CONDITION'
  | 'MEDICATION'
  | 'ANATOMY'
  | 'TIME_EXPRESSION';

/**
 * A structured medical concept extracted from patient conversation text.
 * Includes optional standardized medical codes when available.
 */
export interface ClinicalEntity {
  text: string;
  category: EntityCategory;
  type: string;                   // sub-type from Comprehend Medical
  confidence: number;             // 0.0 – 1.0
  icd10Code?: string;
  rxNormCode?: string;
  beginOffset: number;
  endOffset: number;
}

/**
 * Result produced by the Clinical Extractor after processing a transcript.
 */
export interface ExtractionResult {
  entities: ClinicalEntity[];
  requiresManualReview: boolean;  // true if no entities found
  rawTranscript: string;
}

// ── Conversation Types ───────────────────────────────────────────────────────

/**
 * A single message within a patient–assistant conversation.
 */
export interface TranscriptMessage {
  role: 'patient' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * The full transcript of a conversation session.
 */
export interface ConversationTranscript {
  sessionId: string;
  messages: TranscriptMessage[];
  fullText: string;               // concatenated patient messages for extraction
}


/**
 * Returned when a new conversation session is initialized.
 */
export interface ConversationSession {
  sessionId: string;
  greeting: string;
}

/**
 * Response from the Conversation Engine for each patient message.
 */
export interface ConversationResponse {
  message: string;
  isComplete: boolean;            // true when sufficient info collected
  summary?: string;               // present when isComplete is true
}

// ── Triage Types ─────────────────────────────────────────────────────────────

/**
 * Classification of how quickly a patient needs care.
 */
export type UrgencyLevel =
  | 'Emergency'
  | 'Urgent'
  | 'Semi-Urgent'
  | 'Non-Urgent'
  | 'Self-Care';

/**
 * Result produced by the Triage Assessor after evaluating clinical entities.
 */
export interface TriageResult {
  urgencyLevel: UrgencyLevel;
  rationale: string;
  matchedRules: string[];
  flaggedForReview: boolean;      // true if insufficient data
}

/**
 * A single triage rule evaluated against extracted clinical entities.
 * Rules are evaluated in priority order (Emergency first, Self-Care last).
 */
export interface TriageRule {
  id: string;
  urgencyLevel: UrgencyLevel;
  description: string;
  condition: (entities: ClinicalEntity[]) => boolean;
}

// ── Routing Types ────────────────────────────────────────────────────────────

/**
 * Predefined care pathways a patient can be routed to.
 */
export type CarePathway =
  | 'Emergency Department'
  | 'Urgent Care Clinic'
  | 'Primary Care Appointment'
  | 'Specialist Referral'
  | 'Self-Care Guidance';

/**
 * Recommendation produced by the Routing Engine.
 */
export interface RoutingRecommendation {
  pathway: CarePathway;
  estimatedWaitTime: string;
  nextSteps: string[];
  alert?: string;                 // present for Emergency
  selfCareInstructions?: string;  // present for Non-Urgent / Self-Care
  educationalResources?: string[];
}

// ── Patient Record ───────────────────────────────────────────────────────────

/**
 * Central data object that flows through the pipeline, accumulating data
 * at each stage of the patient intake and triage process.
 */
export interface PatientRecord {
  sessionId: string;
  createdAt: string;                              // ISO 8601
  status: 'in_progress' | 'completed' | 'error';

  // Stage 1: Conversation
  transcript?: ConversationTranscript;

  // Stage 2: Extraction
  extractedEntities?: ClinicalEntity[];
  requiresManualReview?: boolean;

  // Stage 3: Triage
  triageResult?: TriageResult;

  // Stage 4: Routing
  routingRecommendation?: RoutingRecommendation;
}
