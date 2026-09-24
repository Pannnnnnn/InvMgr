/** Turns a detected item name into a reasonable starting-point SKU (the manager can still edit it before saving). */
export function suggestSku(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || 'ITEM'}-${suffix}`;
}
