import type { ReactNode } from 'react';
import { useDragControls } from 'motion/react';
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
  grabberPlacement?: 'top' | 'content';
  dragHandleOnly?: boolean;
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
  grabberPlacement = 'content',
  dragHandleOnly = false,
}: SheetProps): JSX.Element {
  const dragControls = useDragControls();
  const grabber = dragHandleOnly ? (
    <div
      className="sheet-drag-handle"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (dismissible) dragControls.start(event);
      }}
    >
      <div className="sheet-grabber" />
    </div>
  ) : (
    <div
      className={`sheet-grabber${grabberPlacement === 'top' ? ' sheet-grabber--top' : ''}`}
      aria-hidden="true"
    />
  );
  return (
    <AccessibleModal
      open={open}
      title={title}
      presentation="sheet"
      {...(backdropTestId === undefined ? {} : { backdropTestId })}
      {...(headerAction === undefined ? {} : { headerAction })}
      {...(grabberPlacement === 'top' ? { beforeHeader: grabber } : {})}
      onRequestClose={onRequestClose}
      closeBlocked={!dismissible}
      cardClassName="sheet-card"
      cardStyle={{ maxHeight, ...(dragHandleOnly ? { touchAction: 'pan-y' } : {}) }}
      {...(dragHandleOnly ? { dragControls, dragListener: false } : {})}
      onDragEnd={(offsetY, velocityY) => {
        if (dismissible && shouldDismissSheet(offsetY, velocityY)) onRequestClose('drag');
      }}
    >
      {grabberPlacement === 'content' && grabber}
      <div className="sheet-content" data-dirty={dirty ? 'true' : undefined}>
        {children}
      </div>
    </AccessibleModal>
  );
}
