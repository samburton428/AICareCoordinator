import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LocalClinicalExtractor } from '../clinical-extractor.js';
import type { ConversationTranscript, EntityCategory } from '@ai-care-coordinator/shared';

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: EntityCategory[] = [
  'SYMPTOM',
  'CONDITION',
  'MEDICATION',
  'ANATOMY',
  'TIME_EXPRESSION',
];

/**
 * Medical keywords recognised by LocalClinicalExtractor.
 * We mix these into random text to guarantee entity extraction.
 */
const MEDICAL_KEYWORDS = [
  'headache', 'fever', 'chest pain', 'nausea', 'cough',
  'shortness of breath', 'dizziness', 'fatigue', 'sore throat',
  'back pain', 'abdominal pain', 'vomiting', 'rash',
  'ibuprofen', 'aspirin', 'acetaminophen', 'tylenol',
  'arm', 'leg', 'chest', 'throat',
  'two days', 'three days', 'a week', 'yesterday',
];

/**
 * Words that are NOT medical keywords and will not trigger entity extraction.
 */
const NON_MEDICAL_WORDS = [
  'hello', 'world', 'table', 'computer', 'window', 'garden',
  'music', 'river', 'mountain', 'cloud', 'paper', 'pencil',
  'orange', 'purple', 'running', 'jumping', 'quickly', 'slowly',
  'building', 'carpet', 'blanket', 'mirror', 'candle', 'bottle',
];

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Generates a random transcript whose fullText contains at least one medical keyword
 * mixed with other random words, ensuring the extractor will find entities.
 */
const medicalTranscriptArb: fc.Arbitrary<ConversationTranscript> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 10 }), // sessionId
    // Pick 1-3 medical keywords to embed
    fc.shuffledSubarray(MEDICAL_KEYWORDS, { minLength: 1, maxLength: 3 }),
    // Random filler words around the keywords
    fc.array(fc.constantFrom(...NON_MEDICAL_WORDS), { minLength: 1, maxLength: 6 }),
  )
  .map(([sessionId, keywords, fillers]) => {
    // Interleave fillers and keywords to build a realistic sentence
    const parts: string[] = [];
    for (let i = 0; i < Math.max(keywords.length, fillers.length); i++) {
      if (i < fillers.length) parts.push(fillers[i]);
      if (i < keywords.length) parts.push(keywords[i]);
    }
    const fullText = parts.join(' ');
    return {
      sessionId,
      messages: [{ role: 'patient' as const, content: fullText, timestamp: new Date().toISOString() }],
      fullText,
    };
  });

/**
 * Generates a random transcript whose fullText contains NO medical keywords,
 * ensuring the extractor will produce zero entities.
 */
const nonMedicalTranscriptArb: fc.Arbitrary<ConversationTranscript> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 10 }), // sessionId
    fc.array(fc.constantFrom(...NON_MEDICAL_WORDS), { minLength: 2, maxLength: 10 }),
  )
  .map(([sessionId, words]) => {
    const fullText = words.join(' ');
    return {
      sessionId,
      messages: [{ role: 'patient' as const, content: fullText, timestamp: new Date().toISOString() }],
      fullText,
    };
  });

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Clinical Extractor Property Tests', () => {
  const extractor = new LocalClinicalExtractor();

  // Feature: ai-care-coordinator, Property 3: Extraction output structure completeness
  it('Property 3: every extracted ClinicalEntity has a valid category, confidence in [0,1], and rawTranscript matches input', async () => {
    // **Validates: Requirements 2.2, 2.3**
    await fc.assert(
      fc.asyncProperty(medicalTranscriptArb, async (transcript) => {
        const result = await extractor.extractEntities(transcript);

        // rawTranscript must match the input fullText
        expect(result.rawTranscript).toBe(transcript.fullText);

        // At least one entity should be extracted (we embedded medical keywords)
        expect(result.entities.length).toBeGreaterThan(0);

        for (const entity of result.entities) {
          // Category must be from the valid set
          expect(VALID_CATEGORIES).toContain(entity.category);

          // Confidence must be in [0.0, 1.0]
          expect(entity.confidence).toBeGreaterThanOrEqual(0.0);
          expect(entity.confidence).toBeLessThanOrEqual(1.0);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 4: Empty extraction triggers manual review flag
  it('Property 4: when no entities are extracted, requiresManualReview is true', async () => {
    // **Validates: Requirements 2.4**
    await fc.assert(
      fc.asyncProperty(nonMedicalTranscriptArb, async (transcript) => {
        const result = await extractor.extractEntities(transcript);

        // No medical keywords → no entities
        expect(result.entities).toHaveLength(0);

        // Manual review flag must be set
        expect(result.requiresManualReview).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
