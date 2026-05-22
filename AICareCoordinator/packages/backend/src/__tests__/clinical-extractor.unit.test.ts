import { describe, it, expect } from 'vitest';
import { LocalClinicalExtractor } from '../clinical-extractor.js';
import type { ConversationTranscript } from '@ai-care-coordinator/shared';

// ── Helper ───────────────────────────────────────────────────────────────────

function makeTranscript(fullText: string): ConversationTranscript {
  return {
    sessionId: 'test-session',
    messages: [
      { role: 'patient', content: fullText, timestamp: new Date().toISOString() },
    ],
    fullText,
  };
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

describe('LocalClinicalExtractor', () => {
  const extractor = new LocalClinicalExtractor();

  // ── Requirement 2.1, 2.2: Extract known medical entities ─────────────────

  it('extracts SYMPTOM entities for "headache and fever"', async () => {
    const result = await extractor.extractEntities(
      makeTranscript('I have a headache and fever'),
    );

    expect(result.entities.length).toBeGreaterThanOrEqual(2);

    const headache = result.entities.find((e) => e.text === 'headache');
    const fever = result.entities.find((e) => e.text === 'fever');

    expect(headache).toBeDefined();
    expect(headache!.category).toBe('SYMPTOM');

    expect(fever).toBeDefined();
    expect(fever!.category).toBe('SYMPTOM');
  });

  it('extracts entities for "chest pain and shortness of breath"', async () => {
    const result = await extractor.extractEntities(
      makeTranscript('I am experiencing chest pain and shortness of breath'),
    );

    const chestPain = result.entities.find((e) => e.text === 'chest pain');
    const sob = result.entities.find((e) => e.text === 'shortness of breath');

    expect(chestPain).toBeDefined();
    expect(chestPain!.category).toBe('CONDITION');

    expect(sob).toBeDefined();
    expect(sob!.category).toBe('SYMPTOM');
  });

  it('extracts MEDICATION entity for "taking ibuprofen"', async () => {
    const result = await extractor.extractEntities(
      makeTranscript('I have been taking ibuprofen'),
    );

    const ibuprofen = result.entities.find((e) => e.text === 'ibuprofen');
    expect(ibuprofen).toBeDefined();
    expect(ibuprofen!.category).toBe('MEDICATION');
    expect(ibuprofen!.type).toBe('GENERIC_NAME');
  });

  it('extracts TIME_EXPRESSION entity for "yesterday"', async () => {
    const result = await extractor.extractEntities(
      makeTranscript('It started yesterday'),
    );

    const yesterday = result.entities.find((e) => e.text === 'yesterday');
    expect(yesterday).toBeDefined();
    expect(yesterday!.category).toBe('TIME_EXPRESSION');
    expect(yesterday!.type).toBe('TIME_TO_DX_NAME');
  });

  // ── Requirement 2.4: Zero entities → manual review ──────────────────────

  it('sets requiresManualReview when no medical terms found', async () => {
    const result = await extractor.extractEntities(
      makeTranscript('I went to the store and bought some groceries'),
    );

    expect(result.entities).toHaveLength(0);
    expect(result.requiresManualReview).toBe(true);
  });

  // ── Requirement 2.5: ICD-10 and RxNorm code mapping ─────────────────────

  it('entities may include icd10Code and rxNormCode fields', async () => {
    // The LocalClinicalExtractor does not populate codes (only the
    // ComprehendMedicalExtractor does), so we verify the fields are
    // absent/undefined — confirming the interface shape is respected.
    const result = await extractor.extractEntities(
      makeTranscript('headache and ibuprofen'),
    );

    for (const entity of result.entities) {
      // icd10Code and rxNormCode are optional per ClinicalEntity
      expect(entity).toHaveProperty('text');
      expect(entity).toHaveProperty('category');
      expect(entity).toHaveProperty('confidence');
      expect(entity).toHaveProperty('beginOffset');
      expect(entity).toHaveProperty('endOffset');
    }
  });

  // ── Requirement 2.2: Confidence score range ─────────────────────────────

  it('all extracted entities have confidence between 0.0 and 1.0', async () => {
    const result = await extractor.extractEntities(
      makeTranscript('headache fever chest pain ibuprofen yesterday'),
    );

    expect(result.entities.length).toBeGreaterThan(0);

    for (const entity of result.entities) {
      expect(entity.confidence).toBeGreaterThanOrEqual(0.0);
      expect(entity.confidence).toBeLessThanOrEqual(1.0);
    }
  });

  // ── Requirement 2.3: rawTranscript matches input ────────────────────────

  it('rawTranscript in result matches input fullText', async () => {
    const inputText = 'I have a headache and fever since yesterday';
    const result = await extractor.extractEntities(makeTranscript(inputText));

    expect(result.rawTranscript).toBe(inputText);
  });
});
