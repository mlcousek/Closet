import { fingerprint, type Render, type RenderFailure, type RenderRepository } from './renders';

export type RenderOutcome =
  | { kind: 'reused'; render: Render }
  | { kind: 'queued'; render: Render }
  | { kind: 'skipped'; reason: 'noAvatar' | 'empty' };

export type RenderResult = { imagePath: string; thumbPath: string; provider: string };

/** Thrown by the render step to say why no image was produced. */
export class RenderFailedError extends Error {
  constructor(public failure: RenderFailure) {
    super(`Render failed: ${failure}`);
    this.name = 'RenderFailedError';
  }
}

/**
 * Runs try-on renders one at a time. A failed render stays failed until the
 * user asks again: nothing is retried automatically, because every attempt
 * costs money.
 */
export function createRenderQueue(options: {
  renders: RenderRepository;
  /** Produces the image for one render. Throws RenderFailedError with the reason. */
  run: (render: Render) => Promise<RenderResult>;
  onChange?: () => void;
}) {
  const { renders, run, onChange } = options;
  let running: Promise<void> | null = null;

  const drain = async () => {
    for (;;) {
      const render = await renders.claimNext();
      if (!render) return;
      onChange?.();
      try {
        await renders.markDone(render.id, await run(render));
      } catch (error) {
        await renders.markFailed(
          render.id,
          error instanceof RenderFailedError ? error.failure : 'error',
        );
      }
      onChange?.();
    }
  };

  const start = (): Promise<void> => {
    if (!running) {
      running = drain().finally(() => {
        running = null;
      });
    }
    return running;
  };

  return {
    start,
    /**
     * Asks for a render of an outfit. With the same avatar and pieces as an
     * existing finished render, that render is reused and nothing is requested,
     * unless `force` asks for a fresh one (regenerate).
     */
    async request(
      outfit: { id: string; itemIds: string[] },
      avatarBasePath: string | null,
      force = false,
    ): Promise<RenderOutcome> {
      if (!avatarBasePath) return { kind: 'skipped', reason: 'noAvatar' };
      if (outfit.itemIds.length === 0) return { kind: 'skipped', reason: 'empty' };
      const print = fingerprint(avatarBasePath, outfit.itemIds);
      if (!force) {
        const existing = await renders.findDone(print);
        if (existing) {
          if (existing.outfitId === outfit.id) return { kind: 'reused', render: existing };
          // Another outfit with the same pieces already has this picture: point at the same files.
          const copy = await renders.enqueue(outfit.id, print);
          await renders.markDone(copy.id, {
            imagePath: existing.imagePath!,
            thumbPath: existing.thumbPath!,
            provider: existing.provider ?? 'reused',
          });
          onChange?.();
          return { kind: 'reused', render: (await renders.get(copy.id))! };
        }
      }
      // One waiting render per outfit is enough.
      const waiting = (await renders.forOutfit(outfit.id)).find(
        (render) =>
          (render.status === 'queued' || render.status === 'running') &&
          render.fingerprint === print,
      );
      const render = waiting ?? (await renders.enqueue(outfit.id, print));
      onChange?.();
      void start();
      return { kind: 'queued', render };
    },
    /** Called on app start: interrupted renders fail, waiting ones continue. */
    async resume(): Promise<void> {
      await renders.failInterrupted();
      onChange?.();
      void start();
    },
    isRunning: () => running !== null,
  };
}
