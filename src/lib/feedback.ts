/**
 * Multi-modal scanner feedback: haptic, audio, and screen-reader announcement.
 * Preload audio on scanner mount so first scan has low latency.
 */

const SOUNDS = ['success', 'error'] as const;
export type FeedbackType = 'success' | 'alreadyCheckedIn' | 'error';

const HAPTIC: Record<FeedbackType, number[]> = {
  success: [50, 100, 50],
  alreadyCheckedIn: [80, 80, 80],
  error: [200, 100, 200],
};

const DEFAULT_MESSAGE: Record<FeedbackType, string> = {
  success: 'Check-in successful',
  alreadyCheckedIn: 'Already checked in',
  error: 'Invalid code—try again',
};

const audioCache: Record<string, HTMLAudioElement> = {};

function getAudio(kind: 'success' | 'error'): HTMLAudioElement {
  if (!audioCache[kind]) {
    const a = new Audio(`/sounds/${kind}.mp3`);
    a.volume = 0.6;
    audioCache[kind] = a;
  }
  return audioCache[kind];
}

/** Preload success and error sounds so first scan is not delayed. */
export function preloadScannerSounds(): void {
  if (typeof window === 'undefined') return;
  getAudio('success');
  getAudio('error');
}

/**
 * Provide haptic, audio, and optional screen-reader feedback.
 * setAnnouncement updates an aria-live region in the component.
 */
export function provideFeedback(
  type: FeedbackType,
  message?: string,
  setAnnouncement?: (text: string) => void
): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(HAPTIC[type]);
  }
  const audioKind = type === 'alreadyCheckedIn' ? 'success' : type;
  const audio = getAudio(audioKind);
  audio.currentTime = 0;
  audio.play().catch(() => {});
  if (type === 'alreadyCheckedIn' && typeof window !== 'undefined') {
    // Distinct "already checked in" cue: two short beeps.
    window.setTimeout(() => {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }, 180);
  }

  const text = message ?? DEFAULT_MESSAGE[type];
  setAnnouncement?.(text);
}
