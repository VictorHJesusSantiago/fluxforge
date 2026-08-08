/**
 * A minimal, real JSON Schema (draft 2020-12, the dialect zod v4's `z.toJSONSchema` emits) reader
 * — turns a node's params schema into a flat list of what field to render and how, so the
 * property panel (`property-panel.ts`) never has to know a single thing about zod. This is the
 * same "schema drives the form" idea NovaForge's editor used for its component inspector,
 * ported to an actually-standard, actually-serialisable schema format instead of a bespoke one,
 * since here the schema has to cross an HTTP boundary to reach the browser at all.
 */

export interface JsonSchemaProperty {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  format?: string;
  items?: JsonSchemaProperty;
}

export interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'json';

export interface FieldDescriptor {
  name: string;
  kind: FieldKind;
  /** Whether the user must supply this — a field with a schema `default` is never required,
   *  regardless of whether it appears in the schema's own `required` array (zod v4 lists
   *  defaulted fields there too, since a default doesn't change a field's *type*). */
  required: boolean;
  enumOptions: string[] | undefined;
  defaultValue: unknown;
  currentValue: unknown;
}

export function describeFields(
  schema: JsonSchemaObject,
  currentValues: Record<string, unknown>,
): FieldDescriptor[] {
  const properties = schema.properties ?? {};
  const requiredNames = new Set(schema.required ?? []);

  return Object.entries(properties).map(([name, prop]) => {
    const hasDefault = Object.prototype.hasOwnProperty.call(prop, 'default');
    return {
      name,
      kind: fieldKind(prop),
      required: requiredNames.has(name) && !hasDefault,
      enumOptions: prop.enum?.map((v) => String(v)),
      defaultValue: prop.default,
      currentValue: Object.prototype.hasOwnProperty.call(currentValues, name)
        ? currentValues[name]
        : prop.default,
    };
  });
}

function fieldKind(prop: JsonSchemaProperty): FieldKind {
  if (prop.enum !== undefined) return 'enum';
  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'json'; // object/array/unknown — rendered as a raw JSON textarea, honestly labelled as such
  }
}

/**
 * Parses a form field's raw string input back into the value shape the field's kind implies —
 * the inverse of what the property panel displays. `json` fields are parsed as JSON; anything
 * that fails to parse is surfaced as an error string rather than silently coerced, since sending
 * a malformed value straight to the server just relocates the error to a less useful place (a
 * 400 from `PUT /api/workflows/:id` instead of an inline field error).
 */
export function parseFieldInput(kind: FieldKind, raw: string): { value: unknown } | { error: string } {
  switch (kind) {
    case 'string':
      return { value: raw };
    case 'number': {
      const n = Number(raw);
      return Number.isNaN(n) ? { error: `"${raw}" is not a number` } : { value: n };
    }
    case 'boolean':
      return { value: raw === 'true' };
    case 'enum':
      return { value: raw };
    case 'json':
      if (raw.trim() === '') return { value: undefined };
      try {
        return { value: JSON.parse(raw) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
  }
}
