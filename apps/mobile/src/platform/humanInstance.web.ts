/**
 * Shared `@vladmandic/human` singleton for web (ADR-006) — both
 * faceEmbedder.web.ts (embedding) and livenessSignals.web.ts (per-frame
 * eye-openness/head-angle extraction) run detection against the same
 * loaded models, so this lives in one place rather than each module
 * loading its own copy. Model files are self-hosted (not fetched from a
 * CDN, per ADR-015's zero-cost/self-contained requirement) — copied from
 * the installed package into `public/human-models/`, served by Expo's
 * static `public/` folder convention at the same relative path in both
 * `expo start --web` and the exported static build.
 */
import Human, { type Config } from '@vladmandic/human';

/**
 * Only the detector + mesh + description models are enabled — body/hand/
 * object/gesture/segmentation and Human's own emotion/antispoof/liveness
 * models are all unused here. Liveness reuses this project's own shared
 * blink logic (packages/liveness, ADR-018) against mesh-derived eye
 * landmarks, not Human's built-in liveness score, so two platforms don't
 * end up trusting two different liveness mechanisms.
 */
const HUMAN_CONFIG: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: '/human-models/',
  debug: false,
  warmup: 'full',
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 1 },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    gear: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

let humanPromise: Promise<Human> | null = null;

/** Loads and warms up the Human instance once, reused for every subsequent
 * call — coding-standards.md requires loading ML models once, not per call. */
export function getHuman(): Promise<Human> {
  if (!humanPromise) {
    humanPromise = (async () => {
      const human = new Human(HUMAN_CONFIG);
      await human.load();
      await human.warmup();
      return human;
    })();
  }
  return humanPromise;
}
