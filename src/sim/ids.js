// Stable identifiers. Authored entities use IDs derived from scenario, site and local index;
// everything created later draws from saved, monotonic allocators at commit time.

export const ALLOCATORS = ['event', 'job', 'shipment', 'contract', 'incident', 'report', 'command', 'project', 'household'];

export const initAllocators = () => Object.fromEntries(ALLOCATORS.map(k => [k, 1]));

export function allocate(state, kind) {
  if (!(kind in state.ids)) throw new Error(`Unknown allocator ${kind}`);
  return `${kind}:${state.ids[kind]++}`;
}

export const idNumber = id => +String(id).split(':').at(-1);
export const residentId = (site, index) => `person:${site}:${index}`;
export const householdId = (site, index) => `household:${site}:${index}`;
export const fieldId = (site, index) => `field:${site}:${index}`;
export const settlementOf = id => String(id).split(':')[1];
