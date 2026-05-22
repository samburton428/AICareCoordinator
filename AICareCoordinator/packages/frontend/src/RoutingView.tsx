import React from 'react';
import type { RoutingRecommendation } from '@ai-care-coordinator/shared';

export interface RoutingViewProps {
  routingRecommendation: RoutingRecommendation;
}

export function RoutingView({ routingRecommendation }: RoutingViewProps) {
  const rec = routingRecommendation;

  return (
    <div data-testid="routing-view">
      {rec.alert && (
        <div data-testid="alert-message" className="alert-banner">
          🚨 {rec.alert}
        </div>
      )}

      <div data-testid="care-pathway" className="routing-section">
        <h4>Care Pathway</h4>
        <span className="pathway-badge">{rec.pathway}</span>
      </div>

      <div data-testid="wait-time" className="routing-section">
        <h4>Estimated Wait Time</h4>
        <p>{rec.estimatedWaitTime}</p>
      </div>

      <div data-testid="next-steps" className="routing-section">
        <h4>Next Steps</h4>
        <ol>
          {rec.nextSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>

      {rec.selfCareInstructions && (
        <div data-testid="self-care-instructions" className="routing-section">
          <h4>Self-Care Instructions</h4>
          <p>{rec.selfCareInstructions}</p>
        </div>
      )}

      {rec.educationalResources && rec.educationalResources.length > 0 && (
        <div data-testid="educational-resources" className="routing-section">
          <h4>Educational Resources</h4>
          <ul>
            {rec.educationalResources.map((resource, i) => (
              <li key={i}>{resource}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
