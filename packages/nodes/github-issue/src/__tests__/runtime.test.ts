import { describe, it, expect, vi, afterEach } from 'vitest';
import { runNode, createTestContext } from '@fluxforge/sdk';
import { githubIssueNode } from '../runtime.js';

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseParams = { owner: 'octocat', repo: 'hello-world', title: 'Bug: things are broken' };

describe('integration.github-issue node', () => {
  it('throws a clear error when no github credential is configured', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(runNode(githubIssueNode, baseParams, {})).rejects.toThrow(/github.*credential/i);
  });

  it('creates exactly one issue when there is no input', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ number: 42, html_url: 'https://github.com/octocat/hello-world/issues/42' }));
    vi.stubGlobal('fetch', fetchSpy);

    const output = await githubIssueNode.run(
      createTestContext({
        params: { ...baseParams, labels: [] },
        input: {},
        getCredential: (name) => (name === 'github' ? { token: 'ghp_abc' } : undefined),
      }),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(output.main).toEqual([
      { status: 201, ok: true, body: { number: 42, html_url: 'https://github.com/octocat/hello-world/issues/42' } },
    ]);
  });

  it('creates one issue per input item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ number: 1 })));

    const output = await githubIssueNode.run(
      createTestContext({
        params: { ...baseParams, labels: [] },
        input: { main: [{}, {}] },
        getCredential: (name) => (name === 'github' ? { token: 'ghp_abc' } : undefined),
      }),
    );

    expect(output.main).toHaveLength(2);
  });

  it('builds the exact URL from owner/repo and sends the Authorization + Accept headers', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ number: 1 }));
    vi.stubGlobal('fetch', fetchSpy);

    await githubIssueNode.run(
      createTestContext({
        params: { owner: 'acme', repo: 'widgets', title: 'title', labels: ['bug'] },
        input: {},
        getCredential: (name) => (name === 'github' ? { token: 'ghp_xyz' } : undefined),
      }),
    );

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/acme/widgets/issues');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ghp_xyz');
    expect(headers['Accept']).toBe('application/vnd.github+json');
  });

  it('throws on a non-2xx response so the executor can retry it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Not Found' }, 404)));

    await expect(
      githubIssueNode.run(
        createTestContext({
          params: { ...baseParams, labels: [] },
          input: {},
          getCredential: (name) => (name === 'github' ? { token: 'ghp_abc' } : undefined),
        }),
      ),
    ).rejects.toThrow(/HTTP 404/);
  });
});
