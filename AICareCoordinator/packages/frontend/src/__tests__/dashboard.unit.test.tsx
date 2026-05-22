// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { EntityView } from '../EntityView.js';
import { TriageView } from '../TriageView.js';
import { RoutingView } from '../RoutingView.js';
import { StageIndicator } from '../StageIndicator.js';
import type {
  ClinicalEntity,
  TriageResult,
  RoutingRecommendation,
} from '@ai-care-coordinator/shared';

// ── Mock data ────────────────────────────────────────────────────────────────

const mockEntities: ClinicalEntity[] = [
  {
    text: 'headache',
    category: 'SYMPTOM',
    type: 'DX_NAME',
    confidence: 0.92,
    beginOffset: 0,
    endOffset: 8,
  },
  {
    text: 'ibuprofen',
    category: 'MEDICATION',
    type: 'GENERIC_NAME',
    confidence: 0.87,
    rxNormCode: '5640',
    beginOffset: 20,
    endOffset: 29,
  },
];

const mockTriageResult: TriageResult = {
  urgencyLevel: 'Urgent',
  rationale: 'Patient presents with severe headache requiring prompt evaluation.',
  matchedRules: ['severe-headache-rule'],
  flaggedForReview: false,
};

const mockEmergencyRouting: RoutingRecommendation = {
  pathway: 'Emergency Department',
  estimatedWaitTime: 'Immediate',
  nextSteps: ['Call 911', 'Go to nearest ER'],
  alert: 'Life-threatening condition detected. Seek immediate emergency care.',
};

const mockSelfCareRouting: RoutingRecommendation = {
  pathway: 'Self-Care Guidance',
  estimatedWaitTime: 'N/A',
  nextSteps: ['Rest', 'Stay hydrated'],
  selfCareInstructions: 'Take over-the-counter pain relief and rest.',
};

const mockStandardRouting: RoutingRecommendation = {
  pathway: 'Urgent Care Clinic',
  estimatedWaitTime: '30-60 minutes',
  nextSteps: ['Visit nearest urgent care', 'Bring medication list'],
};

const STAGE_NAMES = [
  'Symptom Collection',
  'Clinical Extraction',
  'Urgency Assessment',
  'Care Routing',
];

// ── EntityView tests ─────────────────────────────────────────────────────────

describe('EntityView', () => {
  it('renders entity items with category badges and confidence scores', () => {
    render(<EntityView entities={mockEntities} requiresManualReview={false} />);

    const items = screen.getAllByTestId('entity-item');
    expect(items).toHaveLength(2);

    const categories = screen.getAllByTestId('entity-category');
    expect(categories[0].textContent).toBe('SYMPTOM');
    expect(categories[1].textContent).toBe('MEDICATION');

    const confidences = screen.getAllByTestId('entity-confidence');
    expect(confidences[0].textContent).toContain('92%');
    expect(confidences[1].textContent).toContain('87%');
  });

  it('shows manual review flag when requiresManualReview is true', () => {
    render(<EntityView entities={[]} requiresManualReview={true} />);

    const flag = screen.getByTestId('manual-review-flag');
    expect(flag).toBeTruthy();
    expect(flag.textContent).toContain('Manual review required');
  });
});

// ── TriageView tests ─────────────────────────────────────────────────────────

describe('TriageView', () => {
  it('renders urgency level and rationale', () => {
    render(<TriageView triageResult={mockTriageResult} />);

    const urgency = screen.getByTestId('urgency-level');
    expect(urgency.textContent).toBe('Urgent');

    const rationale = screen.getByTestId('rationale');
    expect(rationale.textContent).toContain(
      'Patient presents with severe headache',
    );
  });
});

// ── RoutingView tests ────────────────────────────────────────────────────────

describe('RoutingView', () => {
  it('renders pathway, wait time, and next steps', () => {
    render(<RoutingView routingRecommendation={mockStandardRouting} />);

    expect(screen.getByTestId('care-pathway').textContent).toContain('Urgent Care Clinic');
    expect(screen.getByTestId('wait-time').textContent).toContain('30-60 minutes');

    const nextSteps = screen.getByTestId('next-steps');
    expect(nextSteps.textContent).toContain('Visit nearest urgent care');
    expect(nextSteps.textContent).toContain('Bring medication list');
  });

  it('shows alert for Emergency routing', () => {
    render(<RoutingView routingRecommendation={mockEmergencyRouting} />);

    const alert = screen.getByTestId('alert-message');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Life-threatening condition detected');
    expect(screen.getByTestId('care-pathway').textContent).toContain('Emergency Department');
  });

  it('shows self-care instructions when present', () => {
    render(<RoutingView routingRecommendation={mockSelfCareRouting} />);

    const selfCare = screen.getByTestId('self-care-instructions');
    expect(selfCare).toBeTruthy();
    expect(selfCare.textContent).toContain('Take over-the-counter pain relief');
  });
});


// ── StageIndicator tests ─────────────────────────────────────────────────────

describe('StageIndicator', () => {
  it('highlights current stage and marks completed stages', () => {
    const { rerender } = render(
      <StageIndicator currentStage={3} stageNames={STAGE_NAMES} />,
    );

    // Stage 1 and 2 are completed (< currentStage)
    const stage1 = screen.getByTestId('stage-1');
    expect(stage1.textContent).toContain('✓');
    expect(stage1.textContent).toContain('Symptom Collection');

    const stage2 = screen.getByTestId('stage-2');
    expect(stage2.textContent).toContain('✓');
    expect(stage2.textContent).toContain('Clinical Extraction');

    // Stage 3 is active (aria-current="step")
    const stage3 = screen.getByTestId('stage-3');
    expect(stage3.getAttribute('aria-current')).toBe('step');
    expect(stage3.textContent).toContain('Urgency Assessment');
    // Active stage should NOT have checkmark
    expect(stage3.textContent).not.toContain('✓');

    // Stage 4 is not yet reached
    const stage4 = screen.getByTestId('stage-4');
    expect(stage4.getAttribute('aria-current')).toBeNull();
    expect(stage4.textContent).not.toContain('✓');
    expect(stage4.textContent).toContain('Care Routing');
  });
});
