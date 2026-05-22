import React from 'react';

export interface StageIndicatorProps {
  currentStage: number; // 1-4
  stageNames: string[];
}

export function StageIndicator({ currentStage, stageNames }: StageIndicatorProps) {
  return (
    <nav aria-label="Progress" className="stage-nav">
      <ol>
        {stageNames.map((name, index) => {
          const stageNumber = index + 1;
          const isActive = stageNumber === currentStage;
          const isCompleted = stageNumber < currentStage;

          const className = isActive
            ? 'stage-active'
            : isCompleted
              ? 'stage-completed'
              : 'stage-pending';

          return (
            <li
              key={stageNumber}
              data-testid={`stage-${stageNumber}`}
              aria-current={isActive ? 'step' : undefined}
              className={className}
            >
              <span className="stage-number">
                {isCompleted ? '✓' : stageNumber}
              </span>
              {isCompleted && <span aria-label="Completed">✓ </span>}
              {name}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
