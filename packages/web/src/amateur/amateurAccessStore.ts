import { create } from 'zustand';

export interface AmateurAccessDetails {
  goalsRemaining: number;
  unlockGoalsRequired: number;
}

export interface AmateurAccessToastState extends AmateurAccessDetails {
  sequence: number;
}

interface AmateurAccessToastStore {
  toast: AmateurAccessToastState | null;
  sequence: number;
  show: (details: AmateurAccessDetails) => void;
  dismiss: (sequence?: number) => void;
}

export const useAmateurAccessToastStore = create<AmateurAccessToastStore>((set) => ({
  toast: null,
  sequence: 0,
  show: (details) =>
    set((state) => {
      const sequence = state.sequence + 1;
      return {
        sequence,
        toast: { ...details, sequence },
      };
    }),
  dismiss: (sequence) =>
    set((state) => {
      if (sequence !== undefined && state.toast?.sequence !== sequence) return state;
      return { toast: null };
    }),
}));

export function showAmateurAccessToast(details: AmateurAccessDetails): void {
  useAmateurAccessToastStore.getState().show(details);
}
