import { describe, it, expect } from 'vitest';
import { RuleBasedTriageAssessor } from '../triage-assessor.js';
import type { PatientRecord, ClinicalEntity } from '@ai-care-coordinator/shared';

// ── Helper ───────────────────────────────────────────────────────────────────

/** Build a PatientRecord with the given ClinicalEntity array. */
function makeRecord(entities?: ClinicalEntity[]): PatientRecord {
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    status: 'in_progress',
    extractedEntities: entities,
  };
}

/** Shorthand to create a SYMPTOM entity. */
function symptom(text: string, confidence = 0.9): ClinicalEntity {
  return {
    text,
    category: 'SYMPTOM',
    type: 'DX_NAME',
    confidence,
    beginOffset: 0,
    endOffset: text.length,
  };
}

/** Shorthand to create a CONDITION entity. */
function condition(text: string, confidence = 0.9): ClinicalEntity {
  return {
    text,
    category: 'CONDITION',
    type: 'DX_NAME',
    confidence,
    beginOffset: 0,
    endOffset: text.length,
  };
}

/** Shorthand to create a MEDICATION entity. */
function medication(text: string, confidence = 0.9): ClinicalEntity {
  return {
    text,
    category: 'MEDICATION',
    type: 'GENERIC_NAME',
    confidence,
    beginOffset: 0,
    endOffset: text.length,
  };
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

describe('RuleBasedTriageAssessor', () => {
  const assessor = new RuleBasedTriageAssessor();

  // ── Requirement 3.4: Life-threatening → Emergency ────────────────────────

  it('chest pain + shortness of breath → Emergency', () => {
    const record = makeRecord([
      condition('chest pain'),
      symptom('shortness of breath'),
    ]);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Emergency');
    expect(result.flaggedForReview).toBe(false);
    expect(result.matchedRules).toContain('EMERGENCY_CHEST_PAIN_SOB');
  });

  // ── Requirement 3.1, 3.2: Fever → Urgent ────────────────────────────────

  it('fever → Urgent', () => {
    const record = makeRecord([symptom('fever')]);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Urgent');
    expect(result.flaggedForReview).toBe(false);
    expect(result.matchedRules).toContain('URGENT_HIGH_FEVER');
  });

  // ── Requirement 3.1, 3.2: Headache → Semi-Urgent ────────────────────────

  it('headache → Semi-Urgent', () => {
    const record = makeRecord([symptom('headache')]);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Semi-Urgent');
    expect(result.flaggedForReview).toBe(false);
    expect(result.matchedRules).toContain('SEMI_URGENT_PERSISTENT_HEADACHE');
  });

  // ── Requirement 3.1, 3.2: Sore throat → Non-Urgent ──────────────────────

  it('sore throat → Non-Urgent', () => {
    const record = makeRecord([symptom('sore throat')]);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Non-Urgent');
    expect(result.flaggedForReview).toBe(false);
    expect(result.matchedRules).toContain('NON_URGENT_SORE_THROAT');
  });

  // ── Requirement 3.1, 3.2: Only medication entities → Self-Care ───────────

  it('only medication entities (ibuprofen) → Self-Care', () => {
    const record = makeRecord([medication('ibuprofen')]);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Self-Care');
    expect(result.flaggedForReview).toBe(false);
    expect(result.matchedRules).toContain('SELF_CARE_ONLY_MEDICATION');
  });

  // ── Requirement 3.5: Empty entities → Semi-Urgent + flaggedForReview ─────

  it('empty entities → Semi-Urgent with flaggedForReview', () => {
    const record = makeRecord([]);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Semi-Urgent');
    expect(result.flaggedForReview).toBe(true);
    expect(result.matchedRules).toHaveLength(0);
  });

  // ── Requirement 3.5: Undefined entities → Semi-Urgent + flaggedForReview ──

  it('undefined extractedEntities → Semi-Urgent with flaggedForReview', () => {
    const record = makeRecord(undefined);

    const result = assessor.assessUrgency(record);

    expect(result.urgencyLevel).toBe('Semi-Urgent');
    expect(result.flaggedForReview).toBe(true);
    expect(result.matchedRules).toHaveLength(0);
  });

  // ── Requirement 3.3: Rationale is always non-empty ───────────────────────

  it('rationale is always a non-empty string', () => {
    const cases: (ClinicalEntity[] | undefined)[] = [
      [condition('chest pain'), symptom('shortness of breath')],
      [symptom('fever')],
      [symptom('headache')],
      [symptom('sore throat')],
      [medication('ibuprofen')],
      [],
      undefined,
    ];

    for (const entities of cases) {
      const result = assessor.assessUrgency(makeRecord(entities));

      expect(typeof result.rationale).toBe('string');
      expect(result.rationale.length).toBeGreaterThan(0);
    }
  });

  // ── Requirement 3.1: matchedRules contains rule ID on match ──────────────

  it('matchedRules contains the rule ID when a rule matches', () => {
    const record = makeRecord([symptom('back pain')]);

    const result = assessor.assessUrgency(record);

    expect(result.matchedRules).toHaveLength(1);
    expect(result.matchedRules[0]).toBe('SEMI_URGENT_BACK_PAIN');
  });
});
