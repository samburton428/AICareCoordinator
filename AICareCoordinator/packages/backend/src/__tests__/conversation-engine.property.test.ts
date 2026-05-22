import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LocalConversationEngine, BedrockConversationEngine } from '../conversation-engine.js';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { vi } from 'vitest';

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Generates a non-empty, non-whitespace-only string suitable as a patient message.
 */
const nonEmptyMessageArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/**
 * Generates an array of 1–5 non-empty patient messages.
 */
const messageSequenceArb = fc.array(nonEmptyMessageArb, { minLength: 1, maxLength: 5 });

/**
 * Generates whitespace-only strings (empty string, spaces, tabs, newlines, combinations).
 */
const whitespaceOnlyArb = fc.oneof(
  fc.constant(''),
  fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 }).map((chars) => chars.join('')),
);

// ── Property 1 ───────────────────────────────────────────────────────────────

describe('Conversation Engine Property Tests', () => {
  // Feature: ai-care-coordinator, Property 1: Conversation transcript preserves all messages
  it('Property 1: for any sequence of non-empty messages, the transcript contains every patient message in order with no loss or reordering', async () => {
    // **Validates: Requirements 1.3**
    await fc.assert(
      fc.asyncProperty(messageSequenceArb, async (messages) => {
        const engine = new LocalConversationEngine();
        const { sessionId } = await engine.initSession();

        // Send each message
        for (const msg of messages) {
          await engine.sendMessage(sessionId, msg);
        }

        // Retrieve transcript
        const transcript = engine.getTranscript(sessionId);

        // Filter to patient-role messages only
        const patientMessages = transcript.messages
          .filter((m) => m.role === 'patient')
          .map((m) => m.content);

        // Assert: same count, same order, same content
        expect(patientMessages).toHaveLength(messages.length);
        expect(patientMessages).toEqual(messages);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: ai-care-coordinator, Property 2: Empty input produces re-prompt
  it('Property 2: for any whitespace-only string, the engine returns a non-empty clarifying response and does not advance conversation state', async () => {
    // **Validates: Requirements 1.5**
    await fc.assert(
      fc.asyncProperty(whitespaceOnlyArb, async (whitespaceInput) => {
        const engine = new LocalConversationEngine();
        const { sessionId } = await engine.initSession();

        // Send the whitespace-only input
        const response = await engine.sendMessage(sessionId, whitespaceInput);

        // Assert: response indicates conversation is not complete
        expect(response.isComplete).toBe(false);

        // Assert: response contains a non-empty clarifying message
        expect(response.message).toBeDefined();
        expect(response.message.length).toBeGreaterThan(0);

        // Assert: transcript has 0 patient messages (state not advanced)
        const transcript = engine.getTranscript(sessionId);
        const patientMessages = transcript.messages.filter((m) => m.role === 'patient');
        expect(patientMessages).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});


// ── BedrockConversationEngine Property Tests ─────────────────────────────────

describe('BedrockConversationEngine Property Tests', () => {
  // Property 1: Transcript preserves all messages
  it('Property 1: for any sequence of non-empty messages, transcript contains every patient message in order', async () => {
    // **Validates: Requirements 1.3**
    await fc.assert(
      fc.asyncProperty(messageSequenceArb, async (messages) => {
        const mockSend = vi.fn().mockResolvedValue({
          output: { message: { content: [{ text: 'Follow-up question from Bedrock' }] } },
        });
        const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;
        const engine = new BedrockConversationEngine(mockClient, 'test-model');
        const { sessionId } = await engine.initSession();

        for (const msg of messages) {
          await engine.sendMessage(sessionId, msg);
        }

        const transcript = engine.getTranscript(sessionId);
        const patientMessages = transcript.messages
          .filter((m) => m.role === 'patient')
          .map((m) => m.content);

        expect(patientMessages).toHaveLength(messages.length);
        expect(patientMessages).toEqual(messages);
      }),
      { numRuns: 100 },
    );
  });

  // Property 2: Empty input produces re-prompt
  it('Property 2: for any whitespace-only string, engine returns non-empty clarifying response without advancing state', async () => {
    // **Validates: Requirements 1.5**
    await fc.assert(
      fc.asyncProperty(whitespaceOnlyArb, async (whitespaceInput) => {
        const mockSend = vi.fn().mockResolvedValue({
          output: { message: { content: [{ text: 'Follow-up question from Bedrock' }] } },
        });
        const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;
        const engine = new BedrockConversationEngine(mockClient, 'test-model');
        const { sessionId } = await engine.initSession();

        const response = await engine.sendMessage(sessionId, whitespaceInput);

        expect(response.isComplete).toBe(false);
        expect(response.message).toBeDefined();
        expect(response.message.length).toBeGreaterThan(0);

        const transcript = engine.getTranscript(sessionId);
        const patientMessages = transcript.messages.filter((m) => m.role === 'patient');
        expect(patientMessages).toHaveLength(0);

        // Mock should not have been called for empty input
        expect(mockSend).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
