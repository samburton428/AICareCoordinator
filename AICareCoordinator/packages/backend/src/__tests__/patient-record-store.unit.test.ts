import { describe, it, expect } from 'vitest';
import { LocalPatientRecordStore } from '../patient-record-store.js';
import type { PatientRecord } from '@ai-care-coordinator/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a concrete completed PatientRecord with realistic clinical data. */
function makeRecord(overrides?: Partial<PatientRecord>): PatientRecord {
  return {
    sessionId: 'session-abc-123',
    createdAt: '2025-01-15T09:30:00.000Z',
    status: 'completed',
    transcript: {
      sessionId: 'session-abc-123',
      messages: [
        { role: 'assistant', content: 'Hello, how can I help you today?', timestamp: '2025-01-15T09:30:00.000Z' },
        { role: 'patient', content: 'I have a severe headache and feel dizzy.', timestamp: '2025-01-15T09:30:15.000Z' },
        { role: 'assistant', content: 'How long have you been experiencing these symptoms?', timestamp: '2025-01-15T09:30:16.000Z' },
        { role: 'patient', content: 'About two days now.', timestamp: '2025-01-15T09:30:30.000Z' },
      ],
      fullText: 'I have a severe headache and feel dizzy. About two days now.',
    },
    extractedEntities: [
      {
        text: 'headache',
        category: 'SYMPTOM',
        type: 'DX_NAME',
        confidence: 0.95,
        icd10Code: 'R51',
        beginOffset: 16,
        endOffset: 24,
      },
      {
        text: 'dizzy',
        category: 'SYMPTOM',
        type: 'DX_NAME',
        confidence: 0.88,
        beginOffset: 35,
        endOffset: 40,
      },
    ],
    requiresManualReview: false,
    triageResult: {
      urgencyLevel: 'Urgent',
      rationale: 'Patient reports severe headache with dizziness lasting two days.',
      matchedRules: ['headache-with-dizziness'],
      flaggedForReview: false,
    },
    routingRecommendation: {
      pathway: 'Urgent Care Clinic',
      estimatedWaitTime: '30-60 minutes',
      nextSteps: ['Check in at urgent care front desk', 'Bring list of current medications'],
    },
    ...overrides,
  };
}

/** Build a second distinct record for multi-record tests. */
function makeSecondRecord(): PatientRecord {
  return {
    sessionId: 'session-def-456',
    createdAt: '2025-01-15T10:00:00.000Z',
    status: 'completed',
    transcript: {
      sessionId: 'session-def-456',
      messages: [
        { role: 'assistant', content: 'Hello, how can I help you today?', timestamp: '2025-01-15T10:00:00.000Z' },
        { role: 'patient', content: 'I have a mild cough and runny nose.', timestamp: '2025-01-15T10:00:10.000Z' },
      ],
      fullText: 'I have a mild cough and runny nose.',
    },
    extractedEntities: [
      {
        text: 'cough',
        category: 'SYMPTOM',
        type: 'DX_NAME',
        confidence: 0.92,
        beginOffset: 15,
        endOffset: 20,
      },
    ],
    requiresManualReview: false,
    triageResult: {
      urgencyLevel: 'Self-Care',
      rationale: 'Mild upper respiratory symptoms consistent with common cold.',
      matchedRules: ['mild-respiratory'],
      flaggedForReview: false,
    },
    routingRecommendation: {
      pathway: 'Self-Care Guidance',
      estimatedWaitTime: 'N/A',
      nextSteps: ['Rest and stay hydrated'],
      selfCareInstructions: 'Use over-the-counter cold remedies as needed.',
      educationalResources: ['https://example.com/common-cold-guide'],
    },
  };
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

describe('LocalPatientRecordStore', () => {
  // ── Requirement 6.1, 6.2: Save and retrieve round-trip ─────────────────

  it('saves a PatientRecord and retrieves it by sessionId with deep equality', async () => {
    const store = new LocalPatientRecordStore();
    const record = makeRecord();

    await store.save(record);
    const retrieved = await store.getBySessionId('session-abc-123');

    expect(retrieved).not.toBeNull();
    expect(retrieved).toEqual(record);
  });

  // ── Requirement 6.2: Non-existent session returns null ─────────────────

  it('returns null for a non-existent sessionId', async () => {
    const store = new LocalPatientRecordStore();

    const result = await store.getBySessionId('does-not-exist');

    expect(result).toBeNull();
  });

  // ── Requirement 6.1, 6.2: Multiple records stored and retrieved ────────

  it('saves multiple records and retrieves each one correctly', async () => {
    const store = new LocalPatientRecordStore();
    const first = makeRecord();
    const second = makeSecondRecord();

    await store.save(first);
    await store.save(second);

    const retrievedFirst = await store.getBySessionId('session-abc-123');
    const retrievedSecond = await store.getBySessionId('session-def-456');

    expect(retrievedFirst).toEqual(first);
    expect(retrievedSecond).toEqual(second);
  });

  // ── Requirement 6.1: Overwrite existing record returns latest version ──

  it('overwrites an existing record and returns the latest version', async () => {
    const store = new LocalPatientRecordStore();
    const original = makeRecord();

    await store.save(original);

    const updated = makeRecord({
      status: 'error',
      triageResult: {
        urgencyLevel: 'Emergency',
        rationale: 'Updated assessment: patient condition worsened.',
        matchedRules: ['chest-pain-shortness-of-breath'],
        flaggedForReview: true,
      },
    });

    await store.save(updated);

    const retrieved = await store.getBySessionId('session-abc-123');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.status).toBe('error');
    expect(retrieved!.triageResult!.urgencyLevel).toBe('Emergency');
    expect(retrieved).toEqual(updated);
  });
});
