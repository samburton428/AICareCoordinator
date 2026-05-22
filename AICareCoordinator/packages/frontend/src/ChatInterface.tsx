import React, { useState, useRef, useEffect } from 'react';
import type { TranscriptMessage, ConversationTranscript, ConversationResponse } from '@ai-care-coordinator/shared';

export interface ChatInterfaceProps {
  messages: TranscriptMessage[];
  isComplete: boolean;
  summary: string | null;
  onSendMessage: (message: string) => Promise<ConversationResponse>;
  onComplete: (transcript: ConversationTranscript) => void;
  sessionId: string;
}

export function ChatInterface({
  messages,
  isComplete,
  summary,
  onSendMessage,
  onComplete,
  sessionId,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input after sending completes or on mount
  useEffect(() => {
    if (!sending && !isComplete) {
      inputRef.current?.focus();
    }
  }, [sending, isComplete]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || isComplete) return;

    setInput('');
    setSending(true);
    try {
      await onSendMessage(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConfirm = () => {
    const patientMessages = messages.filter((m) => m.role === 'patient');
    const fullText = patientMessages.map((m) => m.content).join(' ');
    const transcript: ConversationTranscript = {
      sessionId,
      messages,
      fullText,
    };
    onComplete(transcript);
  };

  return (
    <div data-testid="chat-interface" className="chat-container">
      <div data-testid="message-list" className="message-list">
        {messages.map((msg, i) => (
          <div
            key={i}
            data-testid={`message-${msg.role}`}
            className={`message-bubble ${msg.role === 'patient' ? 'message-patient' : 'message-assistant'}`}
          >
            {msg.content}
          </div>
        ))}
        {sending && (
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {isComplete && summary && (
        <div data-testid="summary-section" className="summary-section">
          <h3>✓ Symptom Summary</h3>
          <p data-testid="summary-text">{summary}</p>
          <button
            data-testid="confirm-button"
            onClick={handleConfirm}
            className="btn-confirm"
          >
            Confirm &amp; Continue to Clinical Extraction
          </button>
        </div>
      )}

      {!isComplete && (
        <div className="chat-input-row">
          <input
            ref={inputRef}
            data-testid="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your symptoms..."
            disabled={sending}
            autoFocus
          />
          <button
            data-testid="send-button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="send-btn"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}
