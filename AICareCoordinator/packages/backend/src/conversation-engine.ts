import { v4 as uuidv4 } from 'uuid';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type {
  ConversationSession,
  ConversationResponse,
  ConversationTranscript,
  TranscriptMessage,
} from '@ai-care-coordinator/shared';

// ── Interface ────────────────────────────────────────────────────────────────

export interface ConversationEngine {
  initSession(): Promise<ConversationSession>;
  sendMessage(sessionId: string, message: string): Promise<ConversationResponse>;
  getTranscript(sessionId: string): ConversationTranscript;
}

// ── Local (mock) implementation ──────────────────────────────────────────────

const GREETING =
  'Hello! I\'m your AI Care Coordinator. Could you please describe the symptoms you\'re experiencing today?';

const FOLLOW_UP_QUESTIONS = [
  'When did these symptoms first start, and how long have they been going on?',
  'On a scale of 1 to 10, how would you rate the severity? Are there any other symptoms you\'ve noticed?',
  'Have you taken any medications or tried any remedies so far?',
];

const RE_PROMPT_MESSAGE =
  'I didn\'t catch that. Could you please describe what you\'re experiencing?';

/** Minimum number of patient messages before the engine considers the conversation complete. */
const MIN_MESSAGES_FOR_COMPLETION = 3;

export class LocalConversationEngine implements ConversationEngine {
  private sessions = new Map<string, TranscriptMessage[]>();

  async initSession(): Promise<ConversationSession> {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, []);
    return { sessionId, greeting: GREETING };
  }

  async sendMessage(sessionId: string, message: string): Promise<ConversationResponse> {
    const history = this.sessions.get(sessionId);
    if (!history) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Empty / whitespace-only input → re-prompt without advancing state
    if (!message || message.trim().length === 0) {
      return { message: RE_PROMPT_MESSAGE, isComplete: false };
    }

    // Record the patient message
    history.push({
      role: 'patient',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Count patient messages to decide completeness
    const patientMessageCount = history.filter((m) => m.role === 'patient').length;

    if (patientMessageCount >= MIN_MESSAGES_FOR_COMPLETION) {
      // Build a summary from all patient messages
      const patientTexts = history
        .filter((m) => m.role === 'patient')
        .map((m) => m.content);
      const summary = `Patient reports: ${patientTexts.join('; ')}.`;

      const assistantMsg = `Thank you. Here is a summary of what you've told me: ${summary} Does this look correct?`;

      history.push({
        role: 'assistant',
        content: assistantMsg,
        timestamp: new Date().toISOString(),
      });

      return { message: assistantMsg, isComplete: true, summary };
    }

    // Otherwise ask a follow-up question
    const questionIndex = Math.min(patientMessageCount - 1, FOLLOW_UP_QUESTIONS.length - 1);
    const followUp = FOLLOW_UP_QUESTIONS[questionIndex];

    history.push({
      role: 'assistant',
      content: followUp,
      timestamp: new Date().toISOString(),
    });

    return { message: followUp, isComplete: false };
  }

  getTranscript(sessionId: string): ConversationTranscript {
    const history = this.sessions.get(sessionId);
    if (!history) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const fullText = history
      .filter((m) => m.role === 'patient')
      .map((m) => m.content)
      .join(' ');

    return { sessionId, messages: [...history], fullText };
  }
}

// ── Bedrock-powered implementation ───────────────────────────────────────────

declare const process: { env: Record<string, string | undefined> };
declare const console: { error(...args: unknown[]): void; log(...args: unknown[]): void };

export class BedrockConversationEngine implements ConversationEngine {
  private sessions = new Map<string, TranscriptMessage[]>();
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(client?: BedrockRuntimeClient, modelId?: string) {
    this.client = client ?? new BedrockRuntimeClient();
    this.modelId = modelId ?? process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-lite-v1:0';
  }

  async initSession(): Promise<ConversationSession> {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, []);
    return { sessionId, greeting: GREETING };
  }

  private buildBedrockMessages(history: TranscriptMessage[]): Array<{ role: 'user' | 'assistant'; content: Array<{ text: string }> }> {
    return history.map((msg) => ({
      role: (msg.role === 'patient' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: [{ text: msg.content }],
    }));
  }

  private async invokeModel(messages: Array<{ role: 'user' | 'assistant'; content: Array<{ text: string }> }>, systemPrompt: string): Promise<string> {
    const command = new ConverseCommand({
      modelId: this.modelId,
      messages,
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 512,
        temperature: 0.7,
      },
    });

    const response = await this.client.send(command);
    const text = response.output?.message?.content?.[0]?.text;
    if (!text) {
      throw new Error('No text in Bedrock response');
    }
    return text;
  }

  private async generateFollowUp(history: TranscriptMessage[]): Promise<string> {
    try {
      const messages = this.buildBedrockMessages(history);
      const systemPrompt =
        'You are a medical intake assistant collecting symptoms for clinical triage. ' +
        'Based on the conversation so far, ask the patient a single focused follow-up question. ' +
        'Focus on: symptom description, onset/duration, severity (1-10 scale), or associated symptoms. ' +
        'Ask only ONE question at a time. Be empathetic and professional. ' +
        'Do NOT say goodbye, give medical advice, or end the conversation. Your only job is to gather clinical information.';
      return await this.invokeModel(messages, systemPrompt);
    } catch (error) {
      const patientCount = history.filter((m) => m.role === 'patient').length;
      const index = Math.min(Math.max(patientCount - 1, 0), FOLLOW_UP_QUESTIONS.length - 1);
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        component: 'BedrockConversationEngine',
        errorType: 'FollowUpGenerationError',
        message: error instanceof Error ? error.message : String(error),
      }));
      return FOLLOW_UP_QUESTIONS[index];
    }
  }

  private async checkCompleteness(history: TranscriptMessage[]): Promise<boolean> {
    const patientCount = history.filter((m) => m.role === 'patient').length;

    // Hard cap: always complete after 3 patient messages to avoid infinite conversations
    if (patientCount >= MIN_MESSAGES_FOR_COMPLETION) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        component: 'BedrockConversationEngine',
        event: 'CompletenessHardCap',
        patientCount,
      }));
      return true;
    }

    try {
      const messages = this.buildBedrockMessages(history);
      const systemPrompt =
        'You are evaluating a medical intake conversation for a triage system. ' +
        'Determine if we have gathered ENOUGH information to proceed to clinical assessment. ' +
        'We need at minimum: (1) the primary symptom, (2) onset or duration, (3) severity or impact. ' +
        'If the patient has provided these three pieces of information, respond with EXACTLY: COMPLETE ' +
        'If critical information is still missing, respond with EXACTLY: INCOMPLETE ' +
        'Respond with ONLY that single word. No explanation, no other text.';
      const response = await this.invokeModel(messages, systemPrompt);
      const upper = response.toUpperCase().trim();
      const isComplete = upper.includes('COMPLETE') && !upper.includes('INCOMPLETE');
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        component: 'BedrockConversationEngine',
        event: 'CompletenessCheck',
        patientCount,
        rawResponse: response.substring(0, 100),
        isComplete,
      }));
      return isComplete;
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        component: 'BedrockConversationEngine',
        errorType: 'CompletenessCheckError',
        message: error instanceof Error ? error.message : String(error),
      }));
      return patientCount >= MIN_MESSAGES_FOR_COMPLETION;
    }
  }

  private async generateSummary(history: TranscriptMessage[]): Promise<string> {
    try {
      const messages = this.buildBedrockMessages(history);
      const systemPrompt =
        'You are a medical documentation assistant. Produce a concise clinical summary of all patient-reported symptoms from this conversation. Include onset, duration, severity, and any associated symptoms mentioned. The summary should be suitable for handoff to clinical extraction.';
      return await this.invokeModel(messages, systemPrompt);
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        component: 'BedrockConversationEngine',
        errorType: 'SummaryGenerationError',
        message: error instanceof Error ? error.message : String(error),
      }));
      const patientTexts = history.filter(m => m.role === 'patient').map(m => m.content);
      return `Patient reports: ${patientTexts.join('; ')}.`;
    }
  }

  async sendMessage(sessionId: string, message: string): Promise<ConversationResponse> {
    const history = this.sessions.get(sessionId);
    if (!history) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Empty / whitespace-only input → re-prompt without advancing state
    if (!message || message.trim().length === 0) {
      return { message: RE_PROMPT_MESSAGE, isComplete: false };
    }

    // Record the patient message
    history.push({
      role: 'patient',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Count patient messages to decide completeness
    const patientCount = history.filter((m) => m.role === 'patient').length;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      component: 'BedrockConversationEngine',
      event: 'SendMessage',
      sessionId,
      patientCount,
      minForCompletion: MIN_MESSAGES_FOR_COMPLETION,
    }));

    if (patientCount >= MIN_MESSAGES_FOR_COMPLETION) {
      const isComplete = await this.checkCompleteness(history);

      if (isComplete) {
        const summary = await this.generateSummary(history);

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          component: 'BedrockConversationEngine',
          event: 'ConversationComplete',
          sessionId,
          summaryLength: summary.length,
        }));

        history.push({
          role: 'assistant',
          content: summary,
          timestamp: new Date().toISOString(),
        });

        return { message: summary, isComplete: true, summary };
      }
    }

    // Not complete or below threshold → generate follow-up
    const followUp = await this.generateFollowUp(history);

    history.push({
      role: 'assistant',
      content: followUp,
      timestamp: new Date().toISOString(),
    });

    return { message: followUp, isComplete: false };
  }

  getTranscript(sessionId: string): ConversationTranscript {
    const history = this.sessions.get(sessionId);
    if (!history) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const fullText = history
      .filter((m) => m.role === 'patient')
      .map((m) => m.content)
      .join(' ');

    return { sessionId, messages: [...history], fullText };
  }
}
