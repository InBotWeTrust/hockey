import type { ReactNode } from 'react';
import { AccessibleModal, type DismissReason } from './AccessibleModal.js';

const DISTANCE_THRESHOLD_PX = 120;
const VELOCITY_THRESHOLD_PX_PER_SECOND = 650;

export function shouldDismissSheet(offsetY: number, velocityY: number): boolean {
  if (offsetY < 0) return false;
  return offsetY >= DISTANCE_THRESHOLD_PX || velocityY >= VELOCITY_THRESHOLD_PX_PER_SECOND;
}

export interface SheetProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onRequestClose: (reason: DismissReason) => void;
  dismissible?: boolean;
  dirty?: boolean;
  maxHeight?: string;
  backdropTestId?: string;
  headerAction?: ReactNode;
}

export function Sheet({
  open,
  title,
  children,
  onRequestClose,
  dismissible = true,
  dirty = false,
  maxHeight = '82dvh',
  backdropTestId,
  headerAction,
}: SheetProps): JSX.Element {
  return (
    <AccessibleModal
      open={open}
      title={title}
      presentation="sheet"
      {...(backdropTestId === undefined ? {} : { backdropTestId })}
      {...(headerAction === undefined ? {} : { headerAction })}
      onRequestClose={onRequestClose}
      closeBlocked={!dismissible}
      cardClassName="sheet-card"
      cardStyle={{ maxHeight }}
      onDragEnd={(offsetY, velocityY) => {
        if (dismissible && shouldDismissSheet(offsetY, velocityY)) onRequestClose('drag');
      }}
    >
      <div className="sheet-grabber" aria-hidden="true" />
      <div className="sheet-content" data-dirty={dirty ? 'true' : undefined}>
        {children}
      </div>
    </AccessibleModal>
  );
}
