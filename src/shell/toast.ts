import { create } from 'zustand';

export type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastState = {
  toast: Toast | null;
  show(toast: Omit<Toast, 'id'>, durationMs?: number): void;
  dismiss(): void;
};

export const TOAST_DURATION_MS = 5000;

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

/** One transient message at the bottom of the screen, optionally with an action such as undo. */
export const useToast = create<ToastState>((set, get) => ({
  toast: null,
  show(toast, durationMs = TOAST_DURATION_MS) {
    if (timer) clearTimeout(timer);
    const id = nextId++;
    set({ toast: { ...toast, id } });
    timer = setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, durationMs);
  },
  dismiss() {
    if (timer) clearTimeout(timer);
    set({ toast: null });
  },
}));

/**
 * Deletes right away and offers undo for a short period, as the recoverable
 * deletion requirement asks. `remove` and `restore` are the repository calls.
 */
export async function deleteWithUndo(options: {
  remove: () => Promise<void>;
  restore: () => Promise<void>;
  message: string;
  undoLabel: string;
  onChange?: () => void;
}): Promise<void> {
  await options.remove();
  options.onChange?.();
  useToast.getState().show({
    message: options.message,
    actionLabel: options.undoLabel,
    onAction: () => {
      void options.restore().then(() => options.onChange?.());
    },
  });
}
