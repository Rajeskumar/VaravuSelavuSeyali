import { EventTable } from './types';

const MAX_VALUE_LENGTH = 100;

/**
 * Whole-event rejection: any unknown event, key, value, nesting, getter, symbol or oversized value
 * returns null. Never logs or throws, and never reads a getter. `invariant` lets an app reject
 * combinations the schema alone allows.
 */
export function validateEvent(
  table: EventTable,
  name: unknown,
  value: unknown,
  invariant?: (result: Record<string, string>) => boolean,
): Record<string, string> | null {
  try {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(table, name)) return null;
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const schema = table[name].properties;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length > Object.keys(schema).length) return null;
    const result: Record<string, string> = {};
    for (const key of keys) {
      if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(schema, key)) return null;
      const d = descriptors[key];
      if (!d || !('value' in d) || typeof d.value !== 'string' || d.value.length > MAX_VALUE_LENGTH) return null;
      if (!schema[key].values.includes(d.value)) return null;
      result[key] = d.value;
    }
    for (const key of Object.keys(schema)) {
      if (!schema[key].optional && !(key in result)) return null;
    }
    if (invariant && !invariant(result)) return null;
    return result;
  } catch {
    return null;
  }
}
