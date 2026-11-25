/**
 * Значки для «на главный экран»: 512×512 и 192×192 PNG, нарисованы программно (без библиотек).
 * Рисунок: тёмно-коричневый фон, латунная рамка, три янтарных окна с «7» и лоток выдачи.
 * Пиксели рисуются с запасом ×4 и ужимаются усреднением — края гладкие.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
if (!OUT) { console.log('нужна папка: node make-icons.mjs <public>/icons'); process.exit(2); }

const BG = [0x24, 0x1a, 0x0b];
const BRASS = [0xa1, 0x62, 0x07];
const DARK = [0x12, 0x0b, 0x06];
const AMBER = [0xfb, 0xbf, 0x24];
const DEEP = [0x2a, 0x14, 0x08];

/** Холст RGBA: рисунок задаётся в координатах 0…512 и умножается на масштаб. */
const makeCanvas = (size) => ({ size, data: new Float64Array(size * size * 4) });

const blend = (canvas, x, y, color, alpha = 1) => {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  const d = canvas.data;
  d[i] = d[i] * (1 - alpha) + color[0] * alpha;
  d[i + 1] = d[i + 1] * (1 - alpha) + color[1] * alpha;
  d[i + 2] = d[i + 2] * (1 - alpha) + color[2] * alpha;
  d[i + 3] = 255;
};

/** Закрасить всё одним цветом. */
function fill(canvas, color) {
  for (let y = 0; y < canvas.size; y++) for (let x = 0; x < canvas.size; x++) blend(canvas, x, y, color);
}

/** Скруглённый прямоугольник. */
function roundRect(canvas, x, y, w, h, r, color, alpha = 1) {
  for (let py = Math.floor(y); py < y + h; py++) {
    for (let px = Math.floor(x); px < x + w; px++) {
      const cx = Math.min(Math.max(px, x + r), x + w - r);
      const cy = Math.min(Math.max(py, y + r), y + h - r);
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= r * r) blend(canvas, px, py, color, alpha);
    }
  }
}

/** Круг. */
function circle(canvas, cx, cy, r, color) {
  for (let py = Math.floor(cy - r); py <= cy + r; py++) {
    for (let px = Math.floor(cx - r); px <= cx + r; px++) {
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= r * r) blend(canvas, px, py, color);
    }
  }
}

/** «7»: верхняя перекладина и наклонная нога — как на барабане автомата. */
function seven(canvas, x, y, w, h, thickness, color) {
  roundRect(canvas, x, y, w, thickness, thickness / 2, color);
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x + w - thickness / 2 - t * (w - thickness * 1.4);
    const py = y + thickness / 2 + t * (h - thickness);
    circle(canvas, px, py, thickness / 2, color);
  }
}

/** Рисунок в координатах 0…512 на холсте любого размера. */
function draw(size) {
  const canvas = makeCanvas(size);
  const k = size / 512;
  const at = (v) => v * k;
  fill(canvas, BG);
  // Латунная рамка и тёмное нутро.
  roundRect(canvas, at(26), at(26), at(460), at(460), at(92), BRASS);
  roundRect(canvas, at(40), at(40), at(432), at(432), at(78), DARK);
  // Три окна барабанов.
  const windowW = at(104), windowH = at(190), gap = at(18);
  const total = windowW * 3 + gap * 2;
  let x = (size - total) / 2;
  for (let i = 0; i < 3; i++) {
    roundRect(canvas, x, at(150), windowW, windowH, at(20), AMBER);
    roundRect(canvas, x + at(7), at(157), windowW - at(14), windowH - at(14), at(14), DEEP);
    seven(canvas, x + at(24), at(190), windowW - at(48), at(108), at(15), AMBER);
    x += windowW + gap;
  }
  // Лоток выдачи внизу.
  roundRect(canvas, at(150), at(385), at(212), at(46), at(16), BRASS);
  roundRect(canvas, at(162), at(395), at(188), at(26), at(10), DEEP);
  return canvas;
}

/** Ужать холст до size×size усреднением блоков (сглаживание краёв). */
function downsample(canvas, size) {
  const block = canvas.size / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(y * block); sy < Math.round((y + 1) * block); sy++) {
        for (let sx = Math.floor(x * block); sx < Math.round((x + 1) * block); sx++) {
          const i = (sy * canvas.size + sx) * 4;
          r += canvas.data[i]; g += canvas.data[i + 1]; b += canvas.data[i + 2]; n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
  }
  return out;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
/** PNG: RGBA, 8 бит, без фильтров — этого хватает для значка. */
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const big = draw(512 * 4);
const small = draw(192 * 4);
writeFileSync(OUT + '/icon-512.png', png(512, downsample(big, 512)));
writeFileSync(OUT + '/icon-192.png', png(192, downsample(small, 192)));
console.log('готово: icon-512.png, icon-192.png в ' + OUT);
