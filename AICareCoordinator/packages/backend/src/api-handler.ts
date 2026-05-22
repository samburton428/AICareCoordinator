/* eslint-disable no-console */
declare const console: { error(...args: unknown[]): void; log(...args: unknown[]): void };

import type { ConversationTranscript, PatientRecord } from '@ai-care-coordinator/shared';
import { BedrockConversationEngine } from './conversation-engine.js';
import { LocalClinicalExtractor } from './clinical-extractor.js';
import { RuleBasedTriageAssessor } from './triage-assessor.js';
import { DefaultRoutingEngine } from './routing-engine.js';
import { DynamoDBPatientRecordStore, LocalPatientRecordStore } from './patient-record-store.js';
import type { PatientRecordStore } from './patient-record-store.js';

// ── Minimal API Gateway types ────────────────────────────────────────────────

export interface APIGatewayEvent {
  // v1 (REST API) fields
  httpMethod?: string;
  path?: string;
  pathParameters?: Record<string, string>;
  body?: string;
  // v2 (HTTP API) fields
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
  rawPath?: string;
}

export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Normalize v1 and v2 event formats into a consistent method + path */
function normalizeEvent(event: APIGatewayEvent): { httpMethod: string; path: string } {
  const httpMethod = event.httpMethod ?? event.requestContext?.http?.method ?? '';
  const path = event.path ?? event.rawPath ?? event.requestContext?.http?.path ?? '';
  return { httpMethod, path };
}

// ── CORS headers ─────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Singleton service instances (created once, reused across invocations) ────

const conversationEngine = new BedrockConversationEngine();
const clinicalExtractor = new LocalClinicalExtractor();
const triageAssessor = new RuleBasedTriageAssessor();
const routingEngine = new DefaultRoutingEngine();
export function createRecordStore(env: Record<string, string | undefined>): PatientRecordStore {
  return env.USE_DYNAMODB === 'true'
    ? new DynamoDBPatientRecordStore(env.DYNAMODB_TABLE_NAME!)
    : new LocalPatientRecordStore();
}

const recordStore: PatientRecordStore = createRecordStore(process.env);

// ── Response helpers ─────────────────────────────────────────────────────────

function jsonResponse(statusCode: number, data: unknown): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayResponse {
  return jsonResponse(statusCode, { error: true, message });
}

// ── Route helpers ────────────────────────────────────────────────────────────

function parseBody(event: APIGatewayEvent): Record<string, unknown> {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Extract the session ID from the path.
 * Supports paths like `/session/{id}`, `/session/{id}/message`, etc.
 */
function extractSessionId(path: string): string | null {
  const match = /^\/session\/([^/]+)/.exec(path);
  return match ? match[1] : null;
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleInitSession(): Promise<APIGatewayResponse> {
  const session = await conversationEngine.initSession();
  return jsonResponse(200, session);
}

async function handleSendMessage(sessionId: string, event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const body = parseBody(event);
  const message = typeof body.message === 'string' ? body.message : '';

  try {
    const response = await conversationEngine.sendMessage(sessionId, message);
    return jsonResponse(200, response);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to send message';
    if (msg.includes('Session not found')) {
      return errorResponse(404, msg);
    }
    return errorResponse(500, msg);
  }
}

async function handleExtractEntities(sessionId: string): Promise<APIGatewayResponse> {
  let transcript: ConversationTranscript;
  try {
    transcript = conversationEngine.getTranscript(sessionId);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get transcript';
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      component: 'APIHandler',
      event: 'ExtractTranscriptError',
      sessionId,
      message: msg,
    }));
    return errorResponse(404, msg);
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    component: 'APIHandler',
    event: 'ExtractEntities',
    sessionId,
    transcriptLength: transcript.fullText.length,
    messageCount: transcript.messages.length,
  }));

  const result = await clinicalExtractor.extractEntities(transcript);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    component: 'APIHandler',
    event: 'ExtractEntitiesResult',
    sessionId,
    entityCount: result.entities.length,
    requiresManualReview: result.requiresManualReview,
  }));

  // Persist extracted entities on the patient record
  const existing = await recordStore.getBySessionId(sessionId);
  const record: PatientRecord = existing ?? {
    sessionId,
    createdAt: new Date().toISOString(),
    status: 'in_progress',
    transcript,
  };
  record.extractedEntities = result.entities;
  record.requiresManualReview = result.requiresManualReview;
  await recordStore.save(record);

  return jsonResponse(200, result);
}

async function handleAssessUrgency(sessionId: string): Promise<APIGatewayResponse> {
  const record = await recordStore.getBySessionId(sessionId);
  if (!record) {
    return errorResponse(404, `Patient record not found for session: ${sessionId}`);
  }

  const triageResult = triageAssessor.assessUrgency(record);
  record.triageResult = triageResult;
  await recordStore.save(record);

  return jsonResponse(200, triageResult);
}

async function handleRoutePatient(sessionId: string): Promise<APIGatewayResponse> {
  const record = await recordStore.getBySessionId(sessionId);
  if (!record) {
    return errorResponse(404, `Patient record not found for session: ${sessionId}`);
  }

  if (!record.triageResult) {
    return errorResponse(400, 'Triage has not been performed yet for this session');
  }

  try {
    const recommendation = await routingEngine.routePatient(record, record.triageResult.urgencyLevel);
    record.routingRecommendation = recommendation;
    record.status = 'completed';
    await recordStore.save(record);

    return jsonResponse(200, recommendation);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Routing failed';
    return errorResponse(500, msg);
  }
}

async function handleGetSession(sessionId: string): Promise<APIGatewayResponse> {
  const record = await recordStore.getBySessionId(sessionId);
  if (!record) {
    return errorResponse(404, `Patient record not found for session: ${sessionId}`);
  }
  return jsonResponse(200, record);
}

// ── Main Lambda handler ──────────────────────────────────────────────────────

export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const { httpMethod, path } = normalizeEvent(event);

  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    // POST /session → initSession
    if (httpMethod === 'POST' && path === '/session') {
      return await handleInitSession();
    }

    const sessionId = extractSessionId(path);
    if (!sessionId) {
      return errorResponse(404, `Route not found: ${httpMethod} ${path}`);
    }

    // POST /session/{id}/message → sendMessage
    if (httpMethod === 'POST' && path.endsWith('/message')) {
      return await handleSendMessage(sessionId, event);
    }

    // POST /session/{id}/extract → extractEntities
    if (httpMethod === 'POST' && path.endsWith('/extract')) {
      return await handleExtractEntities(sessionId);
    }

    // POST /session/{id}/triage → assessUrgency
    if (httpMethod === 'POST' && path.endsWith('/triage')) {
      return await handleAssessUrgency(sessionId);
    }

    // POST /session/{id}/route → routePatient
    if (httpMethod === 'POST' && path.endsWith('/route')) {
      return await handleRoutePatient(sessionId);
    }

    // GET /session/{id} → getBySessionId
    if (httpMethod === 'GET' && /^\/session\/[^/]+$/.test(path)) {
      return await handleGetSession(sessionId);
    }

    return errorResponse(404, `Route not found: ${httpMethod} ${path}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      component: 'APIHandler',
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message,
      path,
      httpMethod,
    }));
    return errorResponse(500, message);
  }
}
