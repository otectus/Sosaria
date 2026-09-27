// Model registry: every static model is a geometry plus named anchors (smoke, doors, lights...).

export const MODELS = new Map();

export function defineModel(name, build) {
  MODELS.set(name, { name, build, geometry: null, anchors: null, footprint: null, height: 0 });
}

// Build lazily; returns { geometry, anchors, footprint:[w,d], height }.
export function getModel(name) {
  const m = MODELS.get(name);
  if (!m) throw new Error('Unknown model ' + name);
  if (!m.geometry) {
    const anchors = { smoke: [], door: null, light: [], fire: [], forge: [], banner: [], sails: [], wheel: [], rune: [], beam: [], seat: [], work: [] };
    const out = m.build(anchors);
    m.geometry = out.geometry || out;
    m.anchors = anchors;
    const bb = m.geometry.boundingBox;
    m.footprint = out.footprint || [bb.max.x - bb.min.x, bb.max.z - bb.min.z];
    m.height = bb.max.y;
  }
  return m;
}
