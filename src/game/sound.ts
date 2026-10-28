/**
 * Звук «Долговой ямы» без файлов: каждый звук синтезируется Web Audio — генераторы, шум и огибающие.
 * Браузер разрешает звук только после первого нажатия, поэтому unlock() зовут на первый клик или клавишу.
 * Громкость звуков и музыки — из настроек (setVolumes). Музыка — тревожный гул и «сердце», которое бьётся чаще, чем ближе беда (setTension).
 * Время звуков — по часам Web Audio (ctx.currentTime): так звук ложится ровно на анимацию без таймеров JavaScript.
 */

// Громкость: всё вместе, эффекты и музыка на полной громкости в настройках.
const MASTER_VOLUME = 0.5;
const SFX_VOLUME = 0.7;
const MUSIC_VOLUME = 0.22;
const VOLUME_GLIDE = 0.05; // громкость меняется плавно за столько секунд — без щелчка
// Музыка: «сердце» — два удара на такт.
const HEART_MIN_BPM = 64; // спокойно
const HEART_MAX_BPM = 118; // прокрутки кончаются, а на долг не хватает
const DRONE_NOTE = 55; // гул — ля большой октавы, Гц
const BELL_EVERY_BEATS = 16; // иногда — тихий тревожный звон

/** Звуки игры: что умеет звук. Его отдают частям, которым нужен точный момент (остановка столбца, выстрел). */
export interface Sfx {
  play(name: SoundName, delay?: number): void;
}

/** Все звуки игры. */
export type SoundName =
  | 'lever'
  | 'roll'
  | 'stop'
  | 'win'
  | 'bigWin'
  | 'skulls'
  | 'shield'
  | 'coin'
  | 'chips'
  | 'burn'
  | 'take'
  | 'ticket'
  | 'item'
  | 'buy'
  | 'deny'
  | 'turn'
  | 'hand'
  | 'payment'
  | 'news'
  | 'warning'
  | 'card'
  | 'cardWin'
  | 'cardLose'
  | 'cylinder'
  | 'cock'
  | 'gunshot'
  | 'dryFire'
  | 'shatter'
  | 'spider'
  | 'lock'
  | 'blood'
  | 'dice'
  | 'death'
  | 'roundStart'
  | 'save'
  | 'rewind'
  | 'crown'
  | 'clover'
  | 'monitor'
  | 'drumTick'
  | 'rust';

export class Sound implements Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxShare = 1; // громкость звуков из настроек, 0…1
  private musicShare = 1; // громкость музыки из настроек, 0…1
  private isPausedNow = false; // игра на паузе — звук стоит
  private tension = 0; // 0 — спокойно, 1 — беда близко
  private nextBeat = 0; // когда следующий удар «сердца», по часам Web Audio
  private beatCount = 0;

  /** Включить звук (после первого нажатия). Можно звать много раз. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.isPausedNow) void this.ctx.resume(); // на паузе звук не будим
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return; // звука нет — играем без него
    // Shift, Esc и другие служебные клавиши браузер не считает действием игрока: звук он тогда не запустит
    // и напишет в консоль предупреждение. Ждём настоящего нажатия (старый браузер без userActivation — как раньше).
    const activation = navigator.userActivation as UserActivation | undefined;
    if (activation && !activation.hasBeenActive) return;
    this.ctx = new AudioContextClass();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.bus(SFX_VOLUME * this.sfxShare);
    this.musicBus = this.bus(MUSIC_VOLUME * this.musicShare);
    this.noiseBuffer = this.makeNoise();
    this.startDrone();
    this.nextBeat = this.ctx.currentTime + 0.5;
    if (this.isPausedNow) void this.ctx.suspend(); // первая клавиша была «пауза» — звук сразу стоит
  }

  /** Пауза: весь звук замирает (часы Web Audio стоят), продолжение — звучит дальше с того же места. */
  setPaused(paused: boolean): void {
    this.isPausedNow = paused;
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Громкость из настроек: звуки и музыка, доли 0…1. До первого нажатия запоминается, потом звучит так. */
  setVolumes(sfxShare: number, musicShare: number): void {
    this.sfxShare = sfxShare;
    this.musicShare = musicShare;
    if (!this.ctx || !this.sfxBus || !this.musicBus) return;
    this.sfxBus.gain.setTargetAtTime(SFX_VOLUME * sfxShare, this.ctx.currentTime, VOLUME_GLIDE);
    this.musicBus.gain.setTargetAtTime(MUSIC_VOLUME * musicShare, this.ctx.currentTime, VOLUME_GLIDE);
  }

  /** Насколько близко беда: 0…1. От неё — как часто бьётся «сердце». */
  setTension(tension: number): void {
    this.tension = Math.min(1, Math.max(0, tension));
  }

  /** Музыка: зовите регулярно (например, раз в 100 мс) — запланирует удары «сердца» чуть вперёд. */
  tickMusic(): void {
    if (!this.ctx) return;
    const lookAhead = this.ctx.currentTime + 0.3;
    while (this.nextBeat < lookAhead) {
      this.heartbeat(this.nextBeat, this.beatCount % 2 === 0);
      if (this.beatCount % BELL_EVERY_BEATS === BELL_EVERY_BEATS - 1) this.bell(this.nextBeat);
      const bpm = HEART_MIN_BPM + (HEART_MAX_BPM - HEART_MIN_BPM) * this.tension;
      this.nextBeat += this.beatCount % 2 === 0 ? 0.28 : 60 / bpm - 0.28; // «ту-тум … ту-тум»: пара ударов за 60/bpm секунд
      this.beatCount += 1;
    }
  }

  /** Сыграть звук name через delay секунд. */
  play(name: SoundName, delay = 0): void {
    if (!this.ctx) return;
    const at = this.ctx.currentTime + delay;
    SOUNDS[name](this, at);
  }

  // ---------- Кирпичики звуков ----------

  /** Тон: частота from (к концу — to), длительность, форма волны, громкость. */
  tone(at: number, from: number, duration: number, type: OscillatorType = 'sine', volume = 0.5, to = from): void {
    if (!this.ctx || !this.sfxBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.005); // быстрая атака — без щелчка
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration); // затухание
    osc.connect(gain).connect(this.sfxBus);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** Шум через полосовой фильтр на частоте freq: шорох, удар, треск. */
  noise(at: number, duration: number, freq: number, volume = 0.4, q = 1): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(this.sfxBus);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  /** Отдельная громкость для эффектов или музыки. */
  private bus(volume: number): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this.master);
    return gain;
  }

  /** Секунда белого шума — из неё режутся все шорохи. */
  private makeNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Гул: два чуть расстроенных низких тона через фильтр, который медленно «дышит». */
  private startDrone(): void {
    if (!this.ctx || !this.musicBus) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const lfo = this.ctx.createOscillator(); // медленное «дыхание» фильтра
    const lfoDepth = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoDepth.gain.value = 90;
    lfo.connect(lfoDepth).connect(filter.frequency);
    for (const detune of [0, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = DRONE_NOTE;
      osc.detune.value = detune;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.18;
      osc.connect(gain).connect(filter);
      osc.start();
    }
    filter.connect(this.musicBus);
    lfo.start();
  }

  /** Удар «сердца»: низкий тон, который быстро падает по частоте. Первый удар пары громче. */
  private heartbeat(at: number, isFirst: boolean): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(isFirst ? 70 : 60, at);
    osc.frequency.exponentialRampToValueAtTime(35, at + 0.18);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(isFirst ? 0.9 : 0.6, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(gain).connect(this.musicBus);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  /** Тихий тревожный звон: два близких высоких тона — режет слух. */
  private bell(at: number): void {
    if (!this.ctx || !this.musicBus) return;
    for (const freq of [880, 932]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.5);
      osc.connect(gain).connect(this.musicBus);
      osc.start(at);
      osc.stop(at + 2.6);
    }
  }
}

/** Ноты для мелодий: частота ноты на n полутонов выше ля первой октавы (440 Гц). */
function note(semitones: number): number {
  return 440 * 2 ** (semitones / 12);
}

/** Каждый звук — из тонов и шума. at — когда начать (по часам Web Audio). */
const SOUNDS: Record<SoundName, (s: Sound, at: number) => void> = {
  lever: (s, at) => {
    s.noise(at, 0.12, 900, 0.5, 2); // скрип рычага
    s.tone(at + 0.12, 140, 0.12, 'square', 0.15, 60); // щелчок внизу
  },
  roll: (s, at) => s.noise(at, 1.0, 2500, 0.08, 0.7), // барабаны крутятся: шорох
  stop: (s, at) => {
    s.tone(at, 220, 0.08, 'triangle', 0.35, 110); // столбец встал: «тук»
    s.noise(at, 0.05, 3000, 0.15, 3);
  },
  win: (s, at) => {
    [0, 4, 7].forEach((step, index) => s.tone(at + index * 0.07, note(step + 3), 0.18, 'triangle', 0.3)); // короткое арпеджио
  },
  bigWin: (s, at) => {
    [0, 4, 7, 12, 16].forEach((step, index) => s.tone(at + index * 0.08, note(step + 3), 0.3, 'square', 0.18));
    s.noise(at, 0.6, 6000, 0.12, 0.5); // звон фишек
  },
  skulls: (s, at) => {
    s.tone(at, 90, 0.6, 'sawtooth', 0.45, 30); // низкий удар
    s.noise(at, 0.4, 300, 0.5, 0.8);
  },
  shield: (s, at) => {
    s.tone(at, 700, 0.25, 'triangle', 0.3, 1400); // звонкий отскок
    s.noise(at, 0.15, 4000, 0.15, 2);
  },
  coin: (s, at) => s.tone(at, 1800, 0.08, 'triangle', 0.25),
  chips: (s, at) => {
    for (let index = 0; index < 5; index++) s.noise(at + index * 0.07, 0.05, 5000 + index * 300, 0.22, 4); // фишки стучат друг о друга
  },
  burn: (s, at) => {
    s.noise(at, 0.5, 1200, 0.3, 0.5); // шипение огня
    s.tone(at, 300, 0.4, 'sawtooth', 0.12, 80);
  },
  take: (s, at) => {
    s.tone(at, 160, 0.1, 'square', 0.25, 90); // кнопка вдавилась
    for (let index = 0; index < 6; index++) s.noise(at + 0.08 + index * 0.07, 0.05, 5200, 0.2, 4);
  },
  ticket: (s, at) => {
    s.noise(at, 0.15, 1800, 0.25, 1.5); // шелест бумаги
    s.tone(at + 0.1, note(15), 0.2, 'triangle', 0.2);
  },
  item: (s, at) => {
    s.noise(at, 0.08, 2000, 0.2, 2);
    s.tone(at + 0.05, note(10), 0.15, 'sine', 0.25, note(15));
  },
  buy: (s, at) => {
    s.noise(at, 0.06, 4000, 0.25, 3); // фишки в щели
    s.tone(at + 0.35, 120, 0.2, 'square', 0.2, 70); // что-то упало в лоток
  },
  deny: (s, at) => s.tone(at, 140, 0.18, 'square', 0.25, 110), // «нельзя»
  turn: (s, at) => s.noise(at, 0.5, 400, 0.15, 0.6), // поворот — шорох одежды
  hand: (s, at) => {
    s.noise(at, 0.4, 250, 0.3, 0.7); // рука выдвигается из темноты
    s.tone(at, 50, 0.6, 'sine', 0.3, 40);
  },
  payment: (s, at) => {
    for (let index = 0; index < 6; index++) s.noise(at + index * 0.07, 0.05, 4800, 0.2, 4);
    s.tone(at + 0.5, 70, 0.3, 'sine', 0.35, 45); // кулак сжался
  },
  news: (s, at) => [0, 7, 12].forEach((step, index) => s.tone(at + index * 0.1, note(step), 0.25, 'triangle', 0.22)),
  warning: (s, at) => {
    for (let index = 0; index < 3; index++) s.tone(at + index * 0.22, 220, 0.18, 'sawtooth', 0.22, 180); // тревога
  },
  card: (s, at) => s.noise(at, 0.07, 3500, 0.3, 2), // карту перевернули
  cardWin: (s, at) => [0, 7].forEach((step, index) => s.tone(at + index * 0.08, note(step + 5), 0.2, 'triangle', 0.25)),
  cardLose: (s, at) => s.tone(at, 200, 0.5, 'sawtooth', 0.25, 70),
  cylinder: (s, at) => {
    let time = at;
    for (let index = 0; index < 10; index++) {
      s.noise(time, 0.03, 4200, 0.25, 5); // барабан револьвера трещит, замедляясь
      time += 0.04 + index * 0.009;
    }
    s.tone(time, 260, 0.06, 'square', 0.25, 160); // барабан встал на место
  },
  cock: (s, at) => {
    s.tone(at, 700, 0.03, 'square', 0.2, 500); // курок взведён
    s.noise(at + 0.06, 0.03, 5000, 0.25, 6);
  },
  gunshot: (s, at) => {
    s.noise(at, 0.06, 3000, 0.9, 0.5); // хлопок
    s.noise(at, 0.7, 500, 0.8, 0.4); // гул выстрела
    s.tone(at, 140, 0.5, 'sawtooth', 0.45, 35);
  },
  dryFire: (s, at) => {
    s.tone(at, 1100, 0.025, 'square', 0.3); // сухой щелчок: холостой
    s.noise(at, 0.04, 6500, 0.3, 6);
  },
  shatter: (s, at) => {
    s.noise(at, 0.5, 5500, 0.45, 0.8); // стекло экрана разлетается
    for (let index = 0; index < 5; index++) s.tone(at + index * 0.04, 2400 + index * 380, 0.09, 'triangle', 0.12); // осколки звенят
    s.noise(at + 0.15, 0.9, 900, 0.18, 0.5); // трещит проводка
  },
  spider: (s, at) => {
    for (let index = 0; index < 4; index++) s.noise(at + index * 0.05, 0.03, 6000, 0.2, 6); // лапки
  },
  lock: (s, at) => {
    s.tone(at, 400, 0.05, 'square', 0.25); // щелчок замка
    s.tone(at + 0.07, 300, 0.08, 'square', 0.2);
  },
  blood: (s, at) => s.tone(at, 80, 0.8, 'sine', 0.35, 60), // глухой удар
  dice: (s, at) => {
    for (let index = 0; index < 3; index++) s.noise(at + index * 0.09, 0.05, 2500, 0.3, 3); // кубик катится
  },
  death: (s, at) => {
    s.tone(at, 110, 1.6, 'sawtooth', 0.3, 40); // конец забега: всё гаснет
    s.noise(at, 1.2, 200, 0.3, 0.5);
  },
  roundStart: (s, at) => [0, 4, 7].forEach((step, index) => s.tone(at + index * 0.06, note(step - 5), 0.15, 'sine', 0.18)),
  save: (s, at) => {
    s.tone(at, 320, 0.06, 'square', 0.25, 200); // щёлкнула кнопка магнитофона
    s.noise(at + 0.08, 0.9, 1400, 0.12, 0.8); // шуршит плёнка
  },
  rewind: (s, at) => {
    s.tone(at, 90, 0.12, 'square', 0.3, 50); // кассета вошла в видеомагнитофон
    s.tone(at + 0.25, 180, 1.7, 'sawtooth', 0.07, 1500); // плёнка перематывается: вой всё выше
    s.noise(at + 0.25, 1.7, 3000, 0.12, 0.6); // и шуршит
  },
  crown: (s, at) => {
    [0, 4, 7, 12].forEach((step, index) => s.tone(at + index * 0.09, note(step + 5), 0.3, 'square', 0.16)); // фанфары: бесплатные прокрутки
    s.tone(at + 0.36, note(17), 0.7, 'triangle', 0.25);
  },
  clover: (s, at) => [12, 16, 19, 24].forEach((step, index) => s.tone(at + index * 0.05, note(step), 0.25, 'sine', 0.18)), // звон удачи
  monitor: (s, at) => {
    s.tone(at, 70, 0.12, 'square', 0.15, 45); // монитор щёлкнул
    s.tone(at + 0.03, 7000, 0.4, 'sine', 0.04, 7800); // и тонко запел, как кинескоп
  },
  drumTick: (s, at) => s.noise(at, 0.025, 3800, 0.16, 5), // барабан: стрелка щёлкает о штырёк между секторами
  rust: (s, at) => {
    s.noise(at, 0.35, 1100, 0.22, 9); // ржавый столбец скрипит
    s.tone(at, 190, 0.3, 'sawtooth', 0.1, 120);
  },
};
