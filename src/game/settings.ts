/**
 * Настройки игры — три параметра: громкость звуков, громкость музыки и язык (язык хранит lang.ts).
 * Громкость — ступени от 0 (выключено) до VOLUME_STEPS. Выбор запоминается в localStorage. Без Phaser.
 */

export type VolumeKind = 'sfx' | 'music'; // звуки или музыка
export type Volumes = Record<VolumeKind, number>;

export const VOLUME_STEPS = 5; // ступеней громкости: 0 — тихо, 5 — громче всего (столько лампочек на панели)
const DEFAULT_VOLUMES: Volumes = { sfx: 5, music: 5 }; // в первый раз — громко, как было до настроек
const SETTINGS_KEY = 'dolgovaya-yama-settings'; // ключ настроек в localStorage

let volumes: Volumes = loadVolumes();
let beforeMute: Volumes | null = null; // громкости до M — их вернёт следующее M

/** Громкости из localStorage; нет их или они битые — по умолчанию. */
function loadVolumes(): Volumes {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_VOLUMES };
    const { sfx, music } = saved as Volumes;
    return { sfx: toLevel(sfx, DEFAULT_VOLUMES.sfx), music: toLevel(music, DEFAULT_VOLUMES.music) };
  } catch {
    return { ...DEFAULT_VOLUMES }; // хранилище запрещено или в нём не JSON
  }
}

/** Ступень громкости: целое от 0 до VOLUME_STEPS; не число — fallback. */
function toLevel(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(VOLUME_STEPS, Math.max(0, Math.round(value)));
}

function saveVolumes(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(volumes));
  } catch {
    // не запомнили — в следующий раз громкость по умолчанию
  }
}

/** Какие сейчас громкости (ступени). */
export function getVolumes(): Volumes {
  return { ...volumes };
}

/** Громкость как доля 0…1 — её отдают звуку. */
export function volumeShare(kind: VolumeKind): number {
  return volumes[kind] / VOLUME_STEPS;
}

/** Поставить громкость kind на ступень level (за краями — до края). */
export function setVolume(kind: VolumeKind, level: number): void {
  volumes[kind] = toLevel(level, volumes[kind]);
  beforeMute = null;
  saveVolumes();
}

/** Весь звук выключен (обе громкости — 0). */
export function isSilent(): boolean {
  return volumes.sfx === 0 && volumes.music === 0;
}

/** M: выключить весь звук (обе громкости в 0); ещё раз — как было до M (или по умолчанию). */
export function toggleSound(): void {
  if (isSilent()) {
    volumes = beforeMute ?? { ...DEFAULT_VOLUMES };
    beforeMute = null;
  } else {
    beforeMute = { ...volumes };
    volumes = { sfx: 0, music: 0 };
  }
  saveVolumes();
}
