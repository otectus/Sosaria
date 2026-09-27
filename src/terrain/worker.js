// Terrain worker: owns a TerrainField and builds chunks and scatter cells on request.

import { TerrainField } from '../world/field.js';
import { buildChunk } from './chunkgen.js';
import { buildScatterCell } from '../world/scatter-gen.js';

let field = null;

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'init') {
    field = new TerrainField(m.features);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (!field) return;
  if (m.type === 'chunk') {
    const c = buildChunk(field, m.face, m.level, m.ix, m.iy);
    self.postMessage({ type: 'chunk', id: m.id, data: c }, [c.pos.buffer, c.nrm.buffer, c.col.buffer, c.surf.buffer, c.magic.buffer, c.farm.buffer, c.road.buffer, c.river.buffer]);
  } else if (m.type === 'scatter') {
    const c = buildScatterCell(field, m.cell, m.G, m.layer);
    self.postMessage({ type: 'scatter', id: m.id, data: c }, c.transfer);
  }
};
