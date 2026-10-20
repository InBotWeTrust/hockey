import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  previousDisabled: boolean;
  nextDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function StoryReplayNavigation(props: Props): JSX.Element {
  return <>
    <button type="button" className="icon-btn story-replay__nav story-replay__nav--previous" aria-label="Предыдущий экран" disabled={props.previousDisabled} onClick={props.onPrevious}><ChevronLeft aria-hidden="true" /></button>
    <button type="button" className="icon-btn story-replay__nav story-replay__nav--next" aria-label="Следующий экран" disabled={props.nextDisabled} onClick={props.onNext}><ChevronRight aria-hidden="true" /></button>
  </>;
}
