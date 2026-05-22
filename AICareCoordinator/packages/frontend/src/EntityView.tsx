import React from 'react';
import type { ClinicalEntity } from '@ai-care-coordinator/shared';

export interface EntityViewProps {
  entities: ClinicalEntity[];
  requiresManualReview: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  SYMPTOM: '#e74c3c',
  CONDITION: '#8e44ad',
  MEDICATION: '#2980b9',
  ANATOMY: '#27ae60',
  TIME_EXPRESSION: '#f39c12',
};

export function EntityView({ entities, requiresManualReview }: EntityViewProps) {
  return (
    <div data-testid="entity-view">
      {requiresManualReview && (
        <div data-testid="manual-review-flag" className="manual-review-banner">
          ⚠ Manual review required — no clinical entities were extracted.
        </div>
      )}

      {entities.length === 0 && !requiresManualReview && (
        <p className="loading-text">No entities to display.</p>
      )}

      <div className="entity-list">
        {entities.map((entity, i) => (
          <div key={i} data-testid="entity-item" className="entity-card">
            <span className="entity-text">{entity.text}</span>

            <span
              data-testid="entity-category"
              className="entity-badge"
              style={{ backgroundColor: CATEGORY_COLORS[entity.category] ?? '#999' }}
            >
              {entity.category}
            </span>

            <span data-testid="entity-confidence" className="entity-confidence">
              {(entity.confidence * 100).toFixed(0)}% confidence
            </span>

            {entity.icd10Code && (
              <span className="entity-icd">ICD-10: {entity.icd10Code}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
