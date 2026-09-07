interface OnboardingCopyProps {
  title: string;
  description: string;
}

export function OnboardingCopy({ title, description }: OnboardingCopyProps): JSX.Element {
  const speechIndex = description.indexOf('\n\n—');
  const narration = speechIndex === -1 ? description : description.slice(0, speechIndex);
  const speech = speechIndex === -1 ? null : description.slice(speechIndex + 2);

  return (
    <div className="onboarding-flow__copy">
      <h1>{title}</h1>
      {narration && <p className="onboarding-flow__narration">{narration}</p>}
      {speech && <blockquote className="onboarding-flow__speech">{speech}</blockquote>}
    </div>
  );
}
