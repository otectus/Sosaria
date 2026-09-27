// Renders an equirectangular preview of the world's terrain field to a PNG (dev tool).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildWorld } from '../src/world/build.js';
import { latLonToDir, dirToLatLon } from '../src/core/sphere.js';
import { INFO_SIZE } from '../src/world/field.js';

const W = +(process.argv[2] || 1200), H = W / 2;
const region = process.argv[3] ? process.argv[3].split(',').map(Number) : [-90, 90, -180, 180]; // lat0,lat1,lon0,lon1
const out = process.argv[4] || 'map.png';
const t0 = Date.now();
const world = buildWorld((p, m) => {});
console.log('build ms', world.buildMs.toFixed(0), 'roads', world.roads.length, 'rivers', world.rivers.length, 'bridges', world.bridges.length);
const f = world.field;
const img = new Uint8Array(W * H * 3);
const info = new Float64Array(INFO_SIZE);
const s = {};
const [la0, la1, lo0, lo1] = region;
const hts = new Float32Array(W * H);
const lod = ((lo1 - lo0) / W) * 1.745 * 0.5;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const lat = la1 - (y + 0.5) / H * (la1 - la0), lon = lo0 + (x + 0.5) / W * (lo1 - lo0);
  const d = latLonToDir(lat, lon);
  f.heightInfo(d[0], d[1], d[2], lod, info);
  hts[y * W + x] = info[0];
  f.surface(d[0], d[1], d[2], info, 0.1, lod, s);
  let r = s.r + s.mr + s.lava * 1.0, g = s.g + s.mg + s.lava * 0.35, b = s.b + s.mb;
  if (info[0] < 0) { r = r * 0.5 + 0.02; g = g * 0.6 + 0.08; b = b * 0.6 + 0.2; }
  const i = (y * W + x) * 3;
  img[i] = Math.min(255, Math.pow(r, 1 / 2.2) * 255); img[i + 1] = Math.min(255, Math.pow(g, 1 / 2.2) * 255); img[i + 2] = Math.min(255, Math.pow(b, 1 / 2.2) * 255);
}
// hillshade
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const dx = hts[y * W + x + 1] - hts[y * W + x - 1], dy = hts[(y + 1) * W + x] - hts[(y - 1) * W + x];
  const sh = Math.max(0.55, Math.min(1.4, 1 + (dx - dy) * 3 / Math.max(0.2, lod * 4)));
  if (hts[y * W + x] > 0) for (let k = 0; k < 3; k++) { const i = (y * W + x) * 3 + k; img[i] = Math.min(255, img[i] * sh); }
}
function mark(lat, lon, c, rad = 2) {
  const x = Math.round((lon - lo0) / (lo1 - lo0) * W), y = Math.round((la1 - lat) / (la1 - la0) * H);
  for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
    const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const k = (Y * W + X) * 3; img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2];
  }
}
for (const s of world.settlements) mark(s.lat, s.lon, [255, 40, 40], 2);
for (const l of world.landmarks) mark(l.lat, l.lon, [255, 230, 0], 1);
for (const ln of world.lanes) for (const d of ln.dirs) { const [la, lo] = dirToLatLon(d); mark(la, lo, [255, 255, 255], 0); }
for (const b of world.bridges) { const [la, lo] = dirToLatLon(b.mid); mark(la, lo, [255, 0, 255], 1); }
// PNG
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, 'in', Date.now() - t0, 'ms');
