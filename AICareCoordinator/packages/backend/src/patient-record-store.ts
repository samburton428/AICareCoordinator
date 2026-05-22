/* eslint-disable no-console */
declare const console: { error(...args: unknown[]): void };

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import type { PatientRecord } from '@ai-care-coordinator/shared';

// ── Interface ────────────────────────────────────────────────────────────────

export interface PatientRecordStore {
  save(record: PatientRecord): Promise<void>;
  getBySessionId(sessionId: string): Promise<PatientRecord | null>;
}

// ── Structured error logging ─────────────────────────────────────────────────

function logError(context: string, error: unknown, sessionId?: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    component: 'PatientRecordStore',
    errorType: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
    context,
    sessionId,
  };
  console.error(JSON.stringify(entry));
}

// ── Local (in-memory) implementation for demo/testing ────────────────────────

export class LocalPatientRecordStore implements PatientRecordStore {
  private records: Map<string, PatientRecord> = new Map();

  async save(record: PatientRecord): Promise<void> {
    try {
      this.records.set(record.sessionId, record);
    } catch (error: unknown) {
      logError('save', error, record.sessionId);
      // Retry once
      try {
        this.records.set(record.sessionId, record);
      } catch (retryError: unknown) {
        logError('save-retry', retryError, record.sessionId);
        throw retryError;
      }
    }
  }

  async getBySessionId(sessionId: string): Promise<PatientRecord | null> {
    try {
      return this.records.get(sessionId) ?? null;
    } catch (error: unknown) {
      logError('getBySessionId', error, sessionId);
      return null;
    }
  }
}


// ── DynamoDB implementation ──────────────────────────────────────────────────

export class DynamoDBPatientRecordStore implements PatientRecordStore {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, client?: DynamoDBClient) {
    const ddbClient = client ?? new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(ddbClient);
    this.tableName = tableName;
  }

  async save(record: PatientRecord): Promise<void> {
    const params = {
      TableName: this.tableName,
      Item: record,
    };

    try {
      await this.docClient.send(new PutCommand(params));
    } catch (error: unknown) {
      logError('save', error, record.sessionId);
      // Retry once
      try {
        await this.docClient.send(new PutCommand(params));
      } catch (retryError: unknown) {
        logError('save-retry', retryError, record.sessionId);
        throw retryError;
      }
    }
  }

  async getBySessionId(sessionId: string): Promise<PatientRecord | null> {
    const params = {
      TableName: this.tableName,
      Key: { sessionId },
    };

    try {
      const result = await this.docClient.send(new GetCommand(params));
      return (result.Item as PatientRecord) ?? null;
    } catch (error: unknown) {
      logError('getBySessionId', error, sessionId);
      return null;
    }
  }
}
