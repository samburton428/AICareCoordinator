import React from 'react';
import type { TriageResult, UrgencyLevel } from '@ai-care-coordinator/shared';

export interface TriageViewProps {
  triageResult: TriageResult;
}

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  Emergency: '#e74c3c',
  Urgent: '#e67e22',
  'Semi-Urgent': '#f1c40f',
  'Non-Urgent': '#3498db',
  'Self-Care': '#2ecc71',
};

export function TriageView({ triageResult }: TriageViewProps) {
  const color = URGENCY_COLORS[triageResult.urgencyLevel];

  return (
    <div data-testid="triage-view">
      <div
        data-testid="urgency-level"
        className="urgency-badge"
        style={{ backgroundColor: color }}
      >
        {triageResult.urgencyLevel}
      </div>

      <div data-testid="rationale" className="triage-section">
        <h4>Rationale</h4>
        <p>{triageResult.rationale}</p>
      </div>

      {triageResult.matchedRules.length > 0 && (
        <div data-testid="matched-rules" className="triage-section">
          <h4>Matched Rules</h4>
          <ul>
            {triageResult.matchedRules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
