import { describe, it, expect } from 'vitest';
import { parseSseChunk } from '../sse-parser.js';

interface TestEvent {
  kind: string;
}

describe('parseSseChunk', () => {
  it('parses a single complete event delivered in one chunk', () => {
    const { events, remainder } = parseSseChunk<TestEvent>('', 'data: {"kind":"run.started"}\n\n');
    expect(events).toEqual([{ kind: 'run.started' }]);
    expect(remainder).toBe('');
  });

  it('parses multiple events in one chunk', () => {
    const { events } = parseSseChunk<TestEvent>(
      '',
      'data: {"kind":"a"}\n\ndata: {"kind":"b"}\n\n',
    );
    expect(events.map((e) => e.kind)).toEqual(['a', 'b']);
  });

  it('holds back an incomplete event as the remainder', () => {
    const { events, remainder } = parseSseChunk<TestEvent>('', 'data: {"kind":"a"}\n\ndata: {"partial');
    expect(events).toEqual([{ kind: 'a' }]);
    expect(remainder).toBe('data: {"partial');
  });

  it('completes a partial event when the next chunk arrives', () => {
    const first = parseSseChunk<TestEvent>('', 'data: {"ki');
    const second = parseSseChunk<TestEvent>(first.remainder, 'nd":"a"}\n\n');
    expect(second.events).toEqual([{ kind: 'a' }]);
    expect(second.remainder).toBe('');
  });

  it('a chunk boundary splitting the blank-line separator itself still completes correctly', () => {
    const first = parseSseChunk<TestEvent>('', 'data: {"kind":"a"}\n');
    const second = parseSseChunk<TestEvent>(first.remainder, '\n');
    expect(second.events).toEqual([{ kind: 'a' }]);
  });

  it('ignores non-"data:" lines within an event block', () => {
    const { events } = parseSseChunk<TestEvent>('', ': a comment\ndata: {"kind":"a"}\n\n');
    expect(events).toEqual([{ kind: 'a' }]);
  });

  it('drops a malformed data line instead of throwing', () => {
    const { events } = parseSseChunk<TestEvent>('', 'data: {not valid json\n\ndata: {"kind":"a"}\n\n');
    expect(events).toEqual([{ kind: 'a' }]);
  });

  it('an empty chunk with an empty buffer yields nothing', () => {
    const { events, remainder } = parseSseChunk<TestEvent>('', '');
    expect(events).toEqual([]);
    expect(remainder).toBe('');
  });
});
