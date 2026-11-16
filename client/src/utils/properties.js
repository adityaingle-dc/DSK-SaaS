import { propertyAddress, propertyKey } from '@dsk/shared';

// Group a customer's valuations by property (same location = same property).
// Returns newest-first groups: { key, address, description, type, valuations (oldest→newest), latest, identified }
export function groupByProperty(valuations = []) {
  const groups = new Map();
  for (const v of valuations) {
    const p = v.data?.property || {};
    const key = propertyKey(p) || `sheet:${v._id}`;
    if (!groups.has(key)) groups.set(key, { key, identified: !key.startsWith('sheet:'), valuations: [] });
    groups.get(key).valuations.push(v);
  }
  return [...groups.values()]
    .map((g) => {
      const list = [...g.valuations].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      const latest = list[list.length - 1];
      const p = latest.data?.property || {};
      return {
        ...g,
        valuations: list,
        latest,
        address: g.identified ? propertyAddress(p) : 'Property details not entered yet',
        description: p.description || '',
        type: latest.data?.general?.propertyType || latest.summary?.propertyType || '',
      };
    })
    .sort((a, b) => new Date(b.latest.updatedAt) - new Date(a.latest.updatedAt));
}

// valuation id -> short property label (for the Input sheets / Reports tabs)
export const propertyLabels = (groups) =>
  Object.fromEntries(groups.flatMap((g) => g.valuations.map((v) => [v._id, g.identified ? g.address : 'Property not entered yet'])));
