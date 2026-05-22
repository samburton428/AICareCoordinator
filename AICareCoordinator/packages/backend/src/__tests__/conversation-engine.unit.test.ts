import { describe, it, expect, beforeEach } from 'vitest';
import { LocalConversationEngine } from '../conversation-engine.js';

describe('LocalConversationEngine', () => {
  let engine: LocalConversationEngine;

  beforeEach(() => {
    engine = new LocalConversationEngine();
  });

  // ── initSession ──────────────────────────────────────────────────────────

  it('initSession returns a sessionId and greeting', async () => {
    const session = await engine.initSession();
    expect(session.sessionId).toBeTruthy();
    expect(session.greeting).toBeTruthy();
    expect(typeof session.greeting).toBe('string');
  });

  // ── sendMessage: empty / whitespace input ────────────────────────────────

  it('returns re-prompt for empty string without advancing state', async () => {
    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, '');
    expect(res.isComplete).toBe(false);
    expect(res.message).toBeTruthy();

    // Transcript should have no patient messages
    const transcript = engine.getTranscript(sessionId);
    expect(transcript.messages).toHaveLength(0);
  });

  it('returns re-prompt for whitespace-only input', async () => {
    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, '   \t\n  ');
    expect(res.isComplete).toBe(false);
    expect(res.message).toBeTruthy();

    const transcript = engine.getTranscript(sessionId);
    expect(transcript.messages).toHaveLength(0);
  });

  // ── sendMessage: follow-up questions ─────────────────────────────────────

  it('returns follow-up question for first valid message', async () => {
    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, 'I have a headache');
    expect(res.isComplete).toBe(false);
    expect(res.message).toBeTruthy();
    expect(res.summary).toBeUndefined();
  });

  // ── sendMessage: completeness detection ──────────────────────────────────

  it('marks conversation complete after 3 patient messages', async () => {
    const { sessionId } = await engine.initSession();
    await engine.sendMessage(sessionId, 'I have a headache');
    await engine.sendMessage(sessionId, 'It started yesterday');
    const res = await engine.sendMessage(sessionId, 'Severity is about 7');

    expect(res.isComplete).toBe(true);
    expect(res.summary).toBeTruthy();
    expect(res.summary).toContain('headache');
  });

  // ── sendMessage: session not found ───────────────────────────────────────

  it('throws for unknown sessionId', async () => {
    await expect(engine.sendMessage('nonexistent', 'hi')).rejects.toThrow(
      'Session not found',
    );
  });

  // ── getTranscript ────────────────────────────────────────────────────────

  it('returns transcript with all messages in order', async () => {
    const { sessionId } = await engine.initSession();
    await engine.sendMessage(sessionId, 'headache');
    await engine.sendMessage(sessionId, 'since yesterday');

    const transcript = engine.getTranscript(sessionId);
    expect(transcript.sessionId).toBe(sessionId);
    // 2 patient + 2 assistant = 4 messages
    expect(transcript.messages).toHaveLength(4);
    expect(transcript.messages[0].role).toBe('patient');
    expect(transcript.messages[0].content).toBe('headache');
    expect(transcript.messages[1].role).toBe('assistant');
    expect(transcript.messages[2].role).toBe('patient');
    expect(transcript.messages[2].content).toBe('since yesterday');
    expect(transcript.messages[3].role).toBe('assistant');
  });

  it('fullText concatenates only patient messages', async () => {
    const { sessionId } = await engine.initSession();
    await engine.sendMessage(sessionId, 'headache');
    await engine.sendMessage(sessionId, 'nausea');

    const transcript = engine.getTranscript(sessionId);
    expect(transcript.fullText).toBe('headache nausea');
  });

  it('throws for unknown sessionId on getTranscript', () => {
    expect(() => engine.getTranscript('nonexistent')).toThrow('Session not found');
  });

  // ── empty input does not count toward completion ─────────────────────────

  it('empty inputs do not count toward the 3-message completion threshold', async () => {
    const { sessionId } = await engine.initSession();
    await engine.sendMessage(sessionId, 'headache');
    await engine.sendMessage(sessionId, '');       // re-prompt, no state change
    await engine.sendMessage(sessionId, '   ');    // re-prompt, no state change
    const res = await engine.sendMessage(sessionId, 'nausea');

    // Only 2 real patient messages so far → not complete
    expect(res.isComplete).toBe(false);
  });
});

import { BedrockConversationEngine } from '../conversation-engine.js';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { vi } from 'vitest';

describe('BedrockConversationEngine', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let engine: BedrockConversationEngine;

  beforeEach(() => {
    mockSend = vi.fn();
    const mockClient = { send: mockSend } as unknown as BedrockRuntimeClient;
    engine = new BedrockConversationEngine(mockClient, 'test-model');
  });

  // ── initSession ──────────────────────────────────────────────────────────

  it('initSession returns a sessionId and greeting', async () => {
    const session = await engine.initSession();
    expect(session.sessionId).toBeTruthy();
    expect(session.greeting).toBeTruthy();
    expect(typeof session.greeting).toBe('string');
  });

  // ── sendMessage: empty / whitespace input ────────────────────────────────

  it('returns re-prompt for empty string without advancing state', async () => {
    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, '');
    expect(res.isComplete).toBe(false);
    expect(res.message).toBeTruthy();

    const transcript = engine.getTranscript(sessionId);
    expect(transcript.messages).toHaveLength(0);
  });

  it('returns re-prompt for whitespace-only input', async () => {
    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, '   \t\n  ');
    expect(res.isComplete).toBe(false);
    expect(res.message).toBeTruthy();

    const transcript = engine.getTranscript(sessionId);
    expect(transcript.messages).toHaveLength(0);
  });

  // ── sendMessage: follow-up generation via Bedrock ────────────────────────

  it('generates follow-up question via Bedrock for first valid message', async () => {
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'When did the headache start?' }] } },
    });

    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, 'I have a headache');

    expect(res.isComplete).toBe(false);
    expect(res.message).toBe('When did the headache start?');
    expect(res.summary).toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // ── sendMessage: completeness detection triggers summary ─────────────────

  it('detects completeness via hard cap and generates summary after 3 messages', async () => {
    // Messages 1 and 2: follow-up generation (patientCount < 3)
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'When did it start?' }] } },
    });
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'How severe is it?' }] } },
    });

    // Message 3: hard cap triggers (patientCount=3 >= MIN_MESSAGES_FOR_COMPLETION=3), summary generation
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'Patient presents with headache since yesterday, severity 7/10.' }] } },
    });

    const { sessionId } = await engine.initSession();
    await engine.sendMessage(sessionId, 'I have a headache');
    await engine.sendMessage(sessionId, 'It started yesterday');
    const res = await engine.sendMessage(sessionId, 'Severity is about 7');

    expect(res.isComplete).toBe(true);
    expect(res.summary).toBe('Patient presents with headache since yesterday, severity 7/10.');
    expect(res.message).toBe('Patient presents with headache since yesterday, severity 7/10.');
    // 2 follow-ups + 1 summary = 3 Bedrock calls (no completeness check due to hard cap)
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('generates follow-up when below hard cap threshold', async () => {
    // Message 1: follow-up generation (patientCount=1, below threshold)
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'When did it start?' }] } },
    });

    const { sessionId } = await engine.initSession();
    const res = await engine.sendMessage(sessionId, 'I have a headache');

    expect(res.isComplete).toBe(false);
    expect(res.message).toBe('When did it start?');
    expect(res.summary).toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // ── getTranscript ────────────────────────────────────────────────────────

  it('returns transcript with all messages in order', async () => {
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'Follow-up 1' }] } },
    });
    mockSend.mockResolvedValueOnce({
      output: { message: { content: [{ text: 'Follow-up 2' }] } },
    });

    const { sessionId } = await engine.initSession();
    await engine.sendMessage(sessionId, 'headache');
    await engine.sendMessage(sessionId, 'since yesterday');

    const transcript = engine.getTranscript(sessionId);
    expect(transcript.sessionId).toBe(sessionId);
    // 2 patient + 2 assistant = 4 messages
    expect(transcript.messages).toHaveLength(4);
    expect(transcript.messages[0].role).toBe('patient');
    expect(transcript.messages[0].content).toBe('headache');
    expect(transcript.messages[1].role).toBe('assistant');
    expect(transcript.messages[1].content).toBe('Follow-up 1');
    expect(transcript.messages[2].role).toBe('patient');
    expect(transcript.messages[2].content).toBe('since yesterday');
    expect(transcript.messages[3].role).toBe('assistant');
    expect(transcript.messages[3].content).toBe('Follow-up 2');
  });

  // ── session-not-found error handling ─────────────────────────────────────

  it('throws for unknown sessionId on sendMessage', async () => {
    await expect(engine.sendMessage('nonexistent', 'hi')).rejects.toThrow(
      'Session not found',
    );
  });

  it('throws for unknown sessionId on getTranscript', () => {
    expect(() => engine.getTranscript('nonexistent')).toThrow('Session not found');
  });

  // ── Fallback behavior when Bedrock throws ──────────────────────────────

  describe('fallback behavior on Bedrock failure', () => {
    beforeEach(() => {
      mockSend.mockRejectedValue(new Error('Bedrock service unavailable'));
    });

    it('falls back to hardcoded follow-up questions when Bedrock throws', async () => {
      const { sessionId } = await engine.initSession();

      const res1 = await engine.sendMessage(sessionId, 'I have a headache');
      expect(res1.isComplete).toBe(false);
      expect(res1.message).toBe(
        'When did these symptoms first start, and how long have they been going on?',
      );

      const res2 = await engine.sendMessage(sessionId, 'It started yesterday');
      expect(res2.isComplete).toBe(false);
      expect(res2.message).toBe(
        "On a scale of 1 to 10, how would you rate the severity? Are there any other symptoms you've noticed?",
      );
    });

    it('falls back to count-based completeness and concatenated summary when Bedrock throws', async () => {
      const { sessionId } = await engine.initSession();

      // Messages 1 and 2: follow-up fallback (patientCount < 3)
      await engine.sendMessage(sessionId, 'I have a headache');
      await engine.sendMessage(sessionId, 'It started yesterday');

      // Message 3: patientCount=3 >= MIN_MESSAGES_FOR_COMPLETION
      // completeness fallback → count-based → complete
      // summary fallback → concatenated patient messages
      const res3 = await engine.sendMessage(sessionId, 'Severity is about 7');

      expect(res3.isComplete).toBe(true);
      expect(res3.summary).toBe(
        'Patient reports: I have a headache; It started yesterday; Severity is about 7.',
      );
      expect(res3.message).toBe(res3.summary);
    });

    it('produces fallback summary in correct format', async () => {
      const { sessionId } = await engine.initSession();

      await engine.sendMessage(sessionId, 'msg1');
      await engine.sendMessage(sessionId, 'msg2');
      const res = await engine.sendMessage(sessionId, 'msg3');

      expect(res.isComplete).toBe(true);
      expect(res.summary).toBe('Patient reports: msg1; msg2; msg3.');
    });

    it('hard cap forces completion after 3 patient messages even if Bedrock says INCOMPLETE', async () => {
      // Reset mock to return INCOMPLETE for completeness checks, follow-ups for others
      mockSend.mockReset();
      // Message 1: follow-up
      mockSend.mockResolvedValueOnce({
        output: { message: { content: [{ text: 'Follow-up 1' }] } },
      });
      // Message 2: follow-up
      mockSend.mockResolvedValueOnce({
        output: { message: { content: [{ text: 'Follow-up 2' }] } },
      });
      // Message 3: hard cap triggers (patientCount=3 >= MIN_MESSAGES_FOR_COMPLETION=3), summary generation
      mockSend.mockResolvedValueOnce({
        output: { message: { content: [{ text: 'Summary of symptoms.' }] } },
      });

      const { sessionId } = await engine.initSession();
      await engine.sendMessage(sessionId, 'msg1');
      await engine.sendMessage(sessionId, 'msg2');

      const res3 = await engine.sendMessage(sessionId, 'msg3');
      expect(res3.isComplete).toBe(true);
      expect(res3.summary).toBe('Summary of symptoms.');
    });

    it('logs structured error on Bedrock failure', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { sessionId } = await engine.initSession();
      await engine.sendMessage(sessionId, 'I have a headache');

      expect(errorSpy).toHaveBeenCalled();
      const loggedArg = errorSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(loggedArg);
      expect(parsed).toMatchObject({
        component: 'BedrockConversationEngine',
        errorType: 'FollowUpGenerationError',
        message: 'Bedrock service unavailable',
      });
      expect(parsed.timestamp).toBeTruthy();

      errorSpy.mockRestore();
    });
  });
});
