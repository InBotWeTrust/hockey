import { useLocation } from 'react-router-dom';
import type { MonthlyRatingCongratulation } from '../../api/amateurDuel.js';
import { MonthlyRatingRewardModal } from './MonthlyRatingRewardModal.js';

type PreviewVariant = 'format-winner' | 'overall-third' | 'combined';

const variants: PreviewVariant[] = ['format-winner', 'overall-third', 'combined'];

const baseCongratulation: MonthlyRatingCongratulation = {
  id: 'monthly-rating-preview',
  season_key: '2026-09',
  place: 1,
  points: 87,
  matches_played: 18,
  eligible_count: 42,
  rewarded_count: 10,
  coins: 0,
  stars: 30,
  experience: 30,
  tokens: 0,
  created_at: '2026-10-01T00:00:00.000Z',
  awards: [
    {
      scope: 'classic',
      place: 1,
      points: 87,
      coins: 0,
      stars: 30,
      experience: 30,
      tokens: 0,
    },
  ],
};

const previewData: Record<PreviewVariant, MonthlyRatingCongratulation> = {
  'format-winner': baseCongratulation,
  'overall-third': {
    ...baseCongratulation,
    id: 'monthly-rating-preview-overall',
    place: 3,
    points: 124,
    coins: 7_500,
    stars: 150,
    experience: 0,
    tokens: 5,
    awards: [
      {
        scope: 'overall',
        place: 3,
        points: 124,
        coins: 7_500,
        stars: 150,
        experience: 0,
        tokens: 5,
      },
    ],
  },
  combined: {
    ...baseCongratulation,
    id: 'monthly-rating-preview-combined',
    place: 1,
    points: 999,
    coins: 15_000,
    stars: 330,
    experience: 30,
    tokens: 10,
    awards: [
      {
        scope: 'overall',
        place: 1,
        points: 999,
        coins: 15_000,
        stars: 300,
        experience: 0,
        tokens: 10,
      },
      {
        scope: 'classic',
        place: 1,
        points: 42,
        coins: 0,
        stars: 30,
        experience: 30,
        tokens: 0,
      },
    ],
  },
};

export function MonthlyRatingRewardPreviewScreen(): JSX.Element {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get('variant');
  const variant = variants.includes(requested as PreviewVariant)
    ? (requested as PreviewVariant)
    : 'format-winner';

  return (
    <main className="screen monthly-rating-reward-preview-screen">
      <MonthlyRatingRewardModal
        congratulation={previewData[variant]}
        pending={false}
        error={null}
        onConfirm={() => undefined}
      />
    </main>
  );
}
