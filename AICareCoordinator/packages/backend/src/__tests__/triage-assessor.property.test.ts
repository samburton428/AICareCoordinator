import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RuleBasedTriageAssessor } from '../triage-assessor.js';
import type {
  PatientRecord,
  ClinicalEntity,
  EntityCategory,
  UrgencyLevel,
} from '@ai-care-coordinator/shared';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_URGENCY_LEVELS: UrgencyLevel[] = [
  'Emergency',
  'Urgent',
  'Semi-Urgent',
  'Non-Urgent',
  'Self-Care',
];

const VALID_CATEGORIES: EntityCategory[] = [
  'SYMPTOM',
  'CONDITION',
  'MEDICATION',
  'ANATOMY',
  'TIME_EXPRESSION',
];

/**
 * Medical keywords that the triage assessor rules recognise.
 */
const MEDICAL_KEYWORDS = [
  'headache', 'fever', 'chest pain', 'nausea', 'cough',
  'shortness of breath', 'dizziness', 'fatigue', 'sore throat',
  'back pain', 'abdominal pain', 'vomiting', 'rash',
  'numbness', 'confusion', 'severe headache', 'vision',
  'severe bleeding',
];

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Generates a random ClinicalEntity with a given text and category.
 */
function entityArb(
  textArb: fc.Arbitrary<string>,
  categoryArb: fc.Arbitrary<EntityCategory>,
): fc.Arbitrary<ClinicalEntity> {
  return fc
    .tuple(textArb, categoryArb, fc.double({ min: 0, max: 1, noNaN: true }))
    .map(([text, category, confidence]) => ({
      text,
      category,
      type: 'DX_NAME',
      confidence,
      beginOffset: 0,
      endOffset: text.length,
    }));
}

/**
 * Generates a random PatientRecord with a mix of medical-keyword entities
 * across random categories, ensuring the triage assessor has data to evaluate.
 */
const randomPatientRecordArb: fc.Arbitrary<PatientRecord> = fc
  .tuple(
    fc.uuid(),
    fc.array(
      entityArb(
        fc.constantFrom(...MEDICAL_KEYWORDS),
        fc.constantFrom(...VALID_CATEGORIES),
      ),
      { minLength: 1, maxLength: 5 },
    ),
  )
  .map(([sessionId, entities]) => ({
    sessionId,
    createdAt: new Date().toISOString(),
    status: 'in_progress' as const,
    extractedEntities: entities,
  }));

/**
 * Generates a PatientRecord that always includes "chest pain" (CONDITION)
 * and "shortness of breath" (SYMPTOM) — the life-threatening combination.
 */
const lifeThreatRecordArb: fc.Arbitrary<PatientRecord> = fc
  .tuple(
    fc.uuid(),
    // Optional extra entities to add noise
    fc.array(
      entityArb(
        fc.constantFrom(...MEDICAL_KEYWORDS),
        fc.constantFrom(...VALID_CATEGORIES),
      ),
      { minLength: 0, maxLength: 3 },
    ),
  )
  .map(([sessionId, extraEntities]) => {
    const chestPain: ClinicalEntity = {
      text: 'chest pain',
      category: 'CONDITION',
      type: 'DX_NAME',
      confidence: 0.95,
      beginOffset: 0,
      endOffset: 10,
    };
    const sob: ClinicalEntity = {
      text: 'shortness of breath',
      category: 'SYMPTOM',
      type: 'DX_NAME',
      confidence: 0.92,
      beginOffset: 11,
      endOffset: 30,
    };
    return {
      sessionId,
      createdAt: new Date().toISOString(),
      status: 'in_progress' as const,
      extractedEntities: [chestPain, sob, ...extraEntities],
    };
  });

/**
 * Generates a PatientRecord with empty or undefined extractedEntities,
 * simulating insufficient clinical data.
 */
const emptyEntitiesRecordArb: fc.Arbitrary<PatientRecord> = fc
  .tuple(
    fc.uuid(),
    fc.constantFrom<ClinicalEntity[] | undefined>([], undefined),
  )
  .map(([sessionId, entities]) => ({
    sessionId,
    createdAt: new Date().toISOString(),
    status: 'in_progress' as const,
    extractedEntities: entities,
  }));

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Triage Assessor Property Tests', () => {
  const assessor = new RuleBasedTriageAssessor();

  // Feature: ai-care-coordinator, Property 5: Triage output completeness
  it('Property 5: result contains exactly one valid UrgencyLevel and a non-empty rationale', () => {
    // **Validates: Requirements 3.2, 3.3**
    fc.assert(
      fc.property(randomPatientRecordArb, (record) => {
        const result = assessor.assessUrgency(record);

        // Exactly one valid urgency level
        expect(VALID_URGENCY_LEVELS).toContain(result.urgencyLevel);

        // Rationale must be a non-empty string
        expect(typeof result.rationale).toBe('string');
        expect(result.rationale.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 6: Life-threatening symptoms produce Emergency urgency
  it('Property 6: chest pain + shortness of breath always produces Emergency', () => {
    // **Validates: Requirements 3.4**
    fc.assert(
      fc.property(lifeThreatRecordArb, (record) => {
        const result = assessor.assessUrgency(record);

        expect(result.urgencyLevel).toBe('Emergency');
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 7: Insufficient data defaults to Semi-Urgent with review flag
  it('Property 7: empty or undefined entities defaults to Semi-Urgent with flaggedForReview', () => {
    // **Validates: Requirements 3.5**
    fc.assert(
      fc.property(emptyEntitiesRecordArb, (record) => {
        const result = assessor.assessUrgency(record);

        expect(result.urgencyLevel).toBe('Semi-Urgent');
        expect(result.flaggedForReview).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
