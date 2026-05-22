import type { PatientRecord } from './types.js';

const VALID_STATUSES = ['in_progress', 'completed', 'error'] as const;

/**
 * Serializes a PatientRecord to a JSON string.
 * Validates required fields before serialization.
 */
export function serializePatientRecord(record: PatientRecord): string {
  const missing: string[] = [];
  if (!record.sessionId) missing.push('sessionId');
  if (!record.createdAt) missing.push('createdAt');
  if (!record.status) missing.push('status');

  if (missing.length > 0) {
    throw new Error(`Cannot serialize PatientRecord: missing required fields: ${missing.join(', ')}`);
  }

  if (!VALID_STATUSES.includes(record.status)) {
    throw new Error(`Cannot serialize PatientRecord: invalid status "${record.status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return JSON.stringify(record);
}

/**
 * Deserializes a JSON string into a PatientRecord.
 * Returns a descriptive error object for malformed input.
 */
export function deserializePatientRecord(json: string): PatientRecord | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: 'Invalid JSON syntax: unable to parse input' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { error: 'Invalid PatientRecord: expected a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields exist
  const missing: string[] = [];
  if (!('sessionId' in obj) || obj.sessionId === undefined || obj.sessionId === null) missing.push('sessionId');
  if (!('createdAt' in obj) || obj.createdAt === undefined || obj.createdAt === null) missing.push('createdAt');
  if (!('status' in obj) || obj.status === undefined || obj.status === null) missing.push('status');

  if (missing.length > 0) {
    return { error: `Missing required fields: ${missing.join(', ')}` };
  }

  // Validate field types
  if (typeof obj.sessionId !== 'string') {
    return { error: `Invalid field type: sessionId must be a string, got ${typeof obj.sessionId}` };
  }

  if (typeof obj.createdAt !== 'string') {
    return { error: `Invalid field type: createdAt must be a string, got ${typeof obj.createdAt}` };
  }

  if (typeof obj.status !== 'string') {
    return { error: `Invalid field type: status must be a string, got ${typeof obj.status}` };
  }

  // Validate status enum value
  if (!VALID_STATUSES.includes(obj.status as typeof VALID_STATUSES[number])) {
    return { error: `Invalid status value: "${obj.status}". Must be one of: ${VALID_STATUSES.join(', ')}` };
  }

  return parsed as PatientRecord;
}
