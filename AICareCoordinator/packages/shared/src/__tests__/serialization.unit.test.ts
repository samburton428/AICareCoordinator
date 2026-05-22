import { describe, it, expect } from 'vitest';
import { serializePatientRecord, deserializePatientRecord } from '../serialization.js';
import type { PatientRecord } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A fully populated PatientRecord covering all optional stages. */
const fullyPopulatedRecord: PatientRecord = {
  sessionId: 'sess-001',
  createdAt: '2025-01-15T10:30:00.000Z',
  status: 'completed',
  transcript: {
    sessionId: 'sess-001',
    messages: [
      { role: 'assistant', content: 'Hello, how can I help?', timestamp: '2025-01-15T10:30:00.000Z' },
      { role: 'patient', content: 'I have a headache and fever.', timestamp: '2025-01-15T10:30:15.000Z' },
    ],
    fullText: 'I have a headache and fever.',
  },
  extractedEntities: [
    {
      text: 'headache',
      category: 'SYMPTOM',
      type: 'DX_NAME',
      confidence: 0.95,
      icd10Code: 'R51',
      beginOffset: 9,
      endOffset: 17,
    },
    {
      text: 'fever',
      category: 'SYMPTOM',
      type: 'DX_NAME',
      confidence: 0.92,
      rxNormCode: undefined,
      beginOffset: 22,
      endOffset: 27,
    },
  ],
  requiresManualReview: false,
  triageResult: {
    urgencyLevel: 'Non-Urgent',
    rationale: 'Headache and fever without life-threatening indicators.',
    matchedRules: ['rule-non-urgent-general'],
    flaggedForReview: false,
  },
  routingRecommendation: {
    pathway: 'Specialist Referral',
    estimatedWaitTime: '2-3 days',
    nextSteps: ['Schedule appointment with primary care provider'],
    selfCareInstructions: 'Rest, stay hydrated, take OTC pain relief as needed.',
    educationalResources: ['https://example.com/headache-info'],
  },
};

// ── Unit Tests ───────────────────────────────────────────────────────────────

describe('Serialization Unit Tests', () => {
  // **Validates: Requirements 7.1, 7.2, 7.3**
  describe('Round-trip serialization', () => {
    it('serializing then deserializing a fully populated PatientRecord produces an equivalent object', () => {
      const json = serializePatientRecord(fullyPopulatedRecord);
      const result = deserializePatientRecord(json);

      expect(result).not.toHaveProperty('error');
      expect(result).toEqual(fullyPopulatedRecord);
    });
  });

  // **Validates: Requirements 7.4**
  describe('Deserialization of invalid input', () => {
    it('completely invalid JSON string returns { error: string }', () => {
      const result = deserializePatientRecord('not json at all');

      expect(result).toHaveProperty('error');
      expect(typeof (result as { error: string }).error).toBe('string');
      expect((result as { error: string }).error.length).toBeGreaterThan(0);
    });

    it('JSON missing sessionId returns error mentioning "sessionId"', () => {
      const json = JSON.stringify({ createdAt: '2025-01-15T10:30:00Z', status: 'completed' });
      const result = deserializePatientRecord(json);

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('sessionId');
    });

    it('JSON missing createdAt returns error mentioning "createdAt"', () => {
      const json = JSON.stringify({ sessionId: 'sess-001', status: 'completed' });
      const result = deserializePatientRecord(json);

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('createdAt');
    });

    it('JSON missing status returns error mentioning "status"', () => {
      const json = JSON.stringify({ sessionId: 'sess-001', createdAt: '2025-01-15T10:30:00Z' });
      const result = deserializePatientRecord(json);

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('status');
    });

    it('JSON with invalid status value returns error', () => {
      const json = JSON.stringify({ sessionId: 'sess-001', createdAt: '2025-01-15T10:30:00Z', status: 'invalid_status' });
      const result = deserializePatientRecord(json);

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('invalid_status');
    });

    it('JSON array returns error', () => {
      const json = JSON.stringify([{ sessionId: 'sess-001' }]);
      const result = deserializePatientRecord(json);

      expect(result).toHaveProperty('error');
      expect(typeof (result as { error: string }).error).toBe('string');
    });
  });

  // **Validates: Requirements 7.1**
  describe('Serialization validation', () => {
    it('serialization of record with missing sessionId throws error', () => {
      const invalid = { createdAt: '2025-01-15T10:30:00Z', status: 'completed' } as unknown as PatientRecord;

      expect(() => serializePatientRecord(invalid)).toThrow('sessionId');
    });
  });
});
