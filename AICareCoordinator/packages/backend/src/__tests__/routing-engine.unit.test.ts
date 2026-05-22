import { describe, it, expect } from 'vitest';
import { DefaultRoutingEngine } from '../routing-engine.js';
import type { PatientRecord, UrgencyLevel } from '@ai-care-coordinator/shared';

// ── Helper ───────────────────────────────────────────────────────────────────

/** Build a minimal PatientRecord suitable for routing. */
function makeRecord(overrides?: Partial<PatientRecord>): PatientRecord {
  return {
    sessionId: 'test-session',
    createdAt: new Date().toISOString(),
    status: 'in_progress',
    ...overrides,
  };
}

// ── Unit Tests ───────────────────────────────────────────────────────────────

describe('DefaultRoutingEngine', () => {
  const engine = new DefaultRoutingEngine();

  // ── Requirement 4.1, 4.2: Each UrgencyLevel → correct CarePathway ───────

  it('Emergency → Emergency Department pathway', async () => {
    const result = await engine.routePatient(makeRecord(), 'Emergency');
    expect(result.pathway).toBe('Emergency Department');
  });

  it('Urgent → Urgent Care Clinic pathway', async () => {
    const result = await engine.routePatient(makeRecord(), 'Urgent');
    expect(result.pathway).toBe('Urgent Care Clinic');
  });

  it('Semi-Urgent → Primary Care Appointment pathway', async () => {
    const result = await engine.routePatient(makeRecord(), 'Semi-Urgent');
    expect(result.pathway).toBe('Primary Care Appointment');
  });

  it('Non-Urgent → Specialist Referral pathway', async () => {
    const result = await engine.routePatient(makeRecord(), 'Non-Urgent');
    expect(result.pathway).toBe('Specialist Referral');
  });

  it('Self-Care → Self-Care Guidance pathway', async () => {
    const result = await engine.routePatient(makeRecord(), 'Self-Care');
    expect(result.pathway).toBe('Self-Care Guidance');
  });

  // ── Requirement 4.3: Emergency includes non-empty alert ──────────────────

  it('Emergency includes a non-empty alert string', async () => {
    const result = await engine.routePatient(makeRecord(), 'Emergency');

    expect(result.alert).toBeDefined();
    expect(typeof result.alert).toBe('string');
    expect(result.alert!.length).toBeGreaterThan(0);
  });

  // ── Requirement 4.4: Non-Urgent includes self-care info ──────────────────

  it('Non-Urgent includes selfCareInstructions and educationalResources', async () => {
    const result = await engine.routePatient(makeRecord(), 'Non-Urgent');

    expect(typeof result.selfCareInstructions).toBe('string');
    expect(result.selfCareInstructions!.length).toBeGreaterThan(0);

    expect(Array.isArray(result.educationalResources)).toBe(true);
    expect(result.educationalResources!.length).toBeGreaterThan(0);
  });

  // ── Requirement 4.4: Self-Care includes self-care info ───────────────────

  it('Self-Care includes selfCareInstructions and educationalResources', async () => {
    const result = await engine.routePatient(makeRecord(), 'Self-Care');

    expect(typeof result.selfCareInstructions).toBe('string');
    expect(result.selfCareInstructions!.length).toBeGreaterThan(0);

    expect(Array.isArray(result.educationalResources)).toBe(true);
    expect(result.educationalResources!.length).toBeGreaterThan(0);
  });

  // ── Requirement 4.2: All pathways have non-empty estimatedWaitTime and nextSteps

  it('all pathways have non-empty estimatedWaitTime and nextSteps', async () => {
    const levels: UrgencyLevel[] = [
      'Emergency',
      'Urgent',
      'Semi-Urgent',
      'Non-Urgent',
      'Self-Care',
    ];

    for (const level of levels) {
      const result = await engine.routePatient(makeRecord(), level);

      expect(typeof result.estimatedWaitTime).toBe('string');
      expect(result.estimatedWaitTime.length).toBeGreaterThan(0);

      expect(Array.isArray(result.nextSteps)).toBe(true);
      expect(result.nextSteps.length).toBeGreaterThan(0);
    }
  });

  // ── Requirement 4.6: Invalid urgency throws error and flags record ───────

  it('invalid urgency level throws error and flags record status as error', async () => {
    const record = makeRecord();

    await expect(
      engine.routePatient(record, 'InvalidLevel' as UrgencyLevel),
    ).rejects.toThrow('Invalid UrgencyLevel');

    expect(record.status).toBe('error');
  });
});
