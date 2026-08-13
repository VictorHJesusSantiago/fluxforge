import { describe, it, expect } from 'vitest';
import { describeFields, parseFieldInput, type JsonSchemaObject } from '../json-schema-form.js';

describe('describeFields', () => {
  const schema: JsonSchemaObject = {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
      method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
      timeout: { type: 'integer', default: 1000 },
      enabled: { type: 'boolean', default: true },
      body: {},
    },
    required: ['url', 'method', 'timeout', 'enabled'],
  };

  it('infers field kinds correctly', () => {
    const fields = describeFields(schema, {});
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.url?.kind).toBe('string');
    expect(byName.method?.kind).toBe('enum');
    expect(byName.timeout?.kind).toBe('number');
    expect(byName.enabled?.kind).toBe('boolean');
    expect(byName.body?.kind).toBe('json');
  });

  it('a field with a schema default is never "required", even if listed in the schema\'s required array', () => {
    const fields = describeFields(schema, {});
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.method?.required).toBe(false);
    expect(byName.url?.required).toBe(true);
  });

  it('uses the schema default as the current value when none is set yet', () => {
    const fields = describeFields(schema, {});
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.method?.currentValue).toBe('GET');
  });

  it('prefers an explicitly-set current value over the schema default', () => {
    const fields = describeFields(schema, { method: 'POST' });
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.method?.currentValue).toBe('POST');
  });

  it('exposes enum options as strings', () => {
    const fields = describeFields(schema, {});
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.method?.enumOptions).toEqual(['GET', 'POST']);
  });

  it('handles a schema with no properties at all', () => {
    expect(describeFields({ type: 'object' }, {})).toEqual([]);
  });
});

describe('parseFieldInput', () => {
  it('string passes through unchanged', () => {
    expect(parseFieldInput('string', 'hello')).toEqual({ value: 'hello' });
  });

  it('number parses a valid numeric string', () => {
    expect(parseFieldInput('number', '42')).toEqual({ value: 42 });
  });

  it('number reports an error for invalid input', () => {
    expect(parseFieldInput('number', 'not a number')).toEqual({ error: '"not a number" is not a number' });
  });

  it('boolean maps the literal string "true"', () => {
    expect(parseFieldInput('boolean', 'true')).toEqual({ value: true });
    expect(parseFieldInput('boolean', 'false')).toEqual({ value: false });
  });

  it('enum passes through the raw string', () => {
    expect(parseFieldInput('enum', 'POST')).toEqual({ value: 'POST' });
  });

  it('json parses valid JSON', () => {
    expect(parseFieldInput('json', '{"a":1}')).toEqual({ value: { a: 1 } });
  });

  it('json reports an error for invalid JSON instead of silently coercing', () => {
    const result = parseFieldInput('json', '{not valid');
    expect('error' in result).toBe(true);
  });

  it('json treats empty input as undefined, not an error', () => {
    expect(parseFieldInput('json', '')).toEqual({ value: undefined });
  });
});
