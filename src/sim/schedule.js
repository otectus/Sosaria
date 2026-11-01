// Due work in a stable order: (tick, priority, entity, sequence). The heap is plain JSON, so a
// saved queue reloads into exactly the same pop order. Stale entries are skipped by token.

export const PRIORITY = { weather: 0, incident: 1, arrival: 2, settlement: 3, decide: 4, field: 5, contract: 6, upkeep: 7 };

const before = (a, b) => a.t !== b.t ? a.t < b.t : a.p !== b.p ? a.p < b.p : a.e !== b.e ? a.e < b.e : a.s < b.s;

export function schedule(state, t, kind, entity, data = null, token = 0) {
  const q = state.queue;
  const item = { t, p: PRIORITY[kind] ?? 9, e: entity, s: state.queueSeq++, k: kind, d: data, v: token };
  q.push(item);
  let i = q.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(q[i], q[parent])) break;
    [q[i], q[parent]] = [q[parent], q[i]];
    i = parent;
  }
  return item;
}

export function peek(state) { return state.queue[0] || null; }

export function pop(state) {
  const q = state.queue;
  const top = q[0];
  const last = q.pop();
  if (q.length) {
    q[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < q.length && before(q[l], q[m])) m = l;
      if (r < q.length && before(q[r], q[m])) m = r;
      if (m === i) break;
      [q[i], q[m]] = [q[m], q[i]];
      i = m;
    }
  }
  return top;
}
