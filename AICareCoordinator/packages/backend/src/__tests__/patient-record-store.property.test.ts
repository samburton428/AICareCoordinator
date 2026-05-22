import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LocalPatientRecordStore } from '../patient-record-store.js';
import type {
  PatientRecord,
  ClinicalEntity,
  EntityCategory,
  TranscriptMessage,
  ConversationTranscript,
  TriageResult,
  UrgencyLevel,
  RoutingRecommendation,
  CarePathway,
} from '@ai-care-coordinator/shared';

// Feature: ai-care-coordinator, Property 14: Patient record persistence round-trip

// ── Generators ───────────────────────────────────────────────────────────────

const entityCategoryArb: fc.Arbitrary<EntityCategory> = fc.constantFrom(
  'SYMPTOM',
  'CONDITION',
  'MEDICATION',
  'ANATOMY',
  'TIME_EXPRESSION',
);

const clinicalEntityArb: fc.Arbitrary<ClinicalEntity> = fc.record({
  text: fc.string({ minLength: 1 }),
  category: entityCategoryArb,
  type: fc.string({ minLength: 1 }),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  icd10Code: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  rxNormCode: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  beginOffset: fc.nat(),
  endOffset: fc.nat(),
});

const transcriptMessageArb: fc.Arbitrary<TranscriptMessage> = fc.record({
  role: fc.constantFrom<'patient' | 'assistant'>('patient', 'assistant'),
  content: fc.string({ minLength: 1 }),
  timestamp: fc.date({ min: new Date('2000-01-01'), max: new Date('2050-12-31') }).map((d) => d.toISOString()),
});

const conversationTranscriptArb: fc.Arbitrary<ConversationTranscript> = fc.record({
  sessionId: fc.uuid(),
  messages: fc.array(transcriptMessageArb, { minLength: 1, maxLength: 10 }),
  fullText: fc.string({ minLength: 1 }),
});

const urgencyLevelArb: fc.Arbitrary<UrgencyLevel> = fc.constantFrom(
  'Emergency',
  'Urgent',
  'Semi-Urgent',
  'Non-Urgent',
  'Self-Care',
);

const triageResultArb: fc.Arbitrary<TriageResult> = fc.record({
  urgencyLevel: urgencyLevelArb,
  rationale: fc.string({ minLength: 1 }),
  matchedRules: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
  flaggedForReview: fc.boolean(),
});

const carePathwayArb: fc.Arbitrary<CarePathway> = fc.constantFrom(
  'Emergency Department',
  'Urgent Care Clinic',
  'Primary Care Appointment',
  'Specialist Referral',
  'Self-Care Guidance',
);

const routingRecommendationArb: fc.Arbitrary<RoutingRecommendation> = fc.record({
  pathway: carePathwayArb,
  estimatedWaitTime: fc.string({ minLength: 1 }),
  nextSteps: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
  alert: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  selfCareInstructions: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
  educationalResources: fc.option(
    fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
    { nil: undefined },
  ),
});


/**
 * Generates a completed PatientRecord with all optional fields populated.
 * Uses unique UUIDs for sessionId to avoid collisions across test iterations.
 */
const completedPatientRecordArb: fc.Arbitrary<PatientRecord> = fc
  .record({
    sessionId: fc.uuid(),
    createdAt: fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') }).map((d) => d.toISOString()),
    status: fc.constant('completed' as const),
    transcript: conversationTranscriptArb,
    extractedEntities: fc.array(clinicalEntityArb, { minLength: 1, maxLength: 5 }),
    requiresManualReview: fc.boolean(),
    triageResult: triageResultArb,
    routingRecommendation: routingRecommendationArb,
  })
  .map((rec) => ({
    ...rec,
    transcript: { ...rec.transcript, sessionId: rec.sessionId },
  }));

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Patient Record Store Property Tests', () => {
  // Feature: ai-care-coordinator, Property 14: Patient record persistence round-trip
  it('Property 14: saving a completed PatientRecord and retrieving by sessionId produces an equivalent record', async () => {
    // **Validates: Requirements 6.1, 6.2**
    await fc.assert(
      fc.asyncProperty(completedPatientRecordArb, async (record) => {
        const store = new LocalPatientRecordStore();

        await store.save(record);
        const retrieved = await store.getBySessionId(record.sessionId);

        // Retrieved record must not be null
        expect(retrieved).not.toBeNull();

        // Retrieved record must deeply equal the original
        expect(retrieved).toEqual(record);
      }),
      { numRuns: 100 },
    );
  });
});
