import { describe, it, expect } from 'vitest';
import { buildIssueUrl, buildIssuePayload, buildRequest } from '../request.js';
import type { GithubIssueParams } from '../schema.js';

function params(overrides: Partial<GithubIssueParams> = {}): GithubIssueParams {
  return {
    owner: 'octocat',
    repo: 'hello-world',
    title: 'Bug: things are broken',
    labels: [],
    ...overrides,
  };
}

describe('buildIssueUrl', () => {
  it('builds the repo issues endpoint URL', () => {
    expect(buildIssueUrl('octocat', 'hello-world')).toBe(
      'https://api.github.com/repos/octocat/hello-world/issues',
    );
  });

  it('URL-encodes owner and repo segments', () => {
    expect(buildIssueUrl('my org', 'my repo')).toBe(
      'https://api.github.com/repos/my%20org/my%20repo/issues',
    );
  });
});

describe('buildIssuePayload', () => {
  it('includes only title when body and labels are absent', () => {
    expect(buildIssuePayload(params())).toEqual({ title: 'Bug: things are broken' });
  });

  it('includes body when given', () => {
    expect(buildIssuePayload(params({ body: 'steps to reproduce...' }))).toEqual({
      title: 'Bug: things are broken',
      body: 'steps to reproduce...',
    });
  });

  it('includes labels when non-empty', () => {
    expect(buildIssuePayload(params({ labels: ['bug', 'p1'] }))).toEqual({
      title: 'Bug: things are broken',
      labels: ['bug', 'p1'],
    });
  });

  it('omits labels when empty', () => {
    expect(buildIssuePayload(params({ labels: [] }))).toEqual({ title: 'Bug: things are broken' });
  });
});

describe('buildRequest', () => {
  it('builds a POST request with the GitHub API contract headers', () => {
    const { url, init } = buildRequest(params(), 'ghp_secret123');
    expect(url).toBe('https://api.github.com/repos/octocat/hello-world/issues');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer ghp_secret123');
    expect(init.headers['Accept']).toBe('application/vnd.github+json');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ title: 'Bug: things are broken' });
  });

  it('includes body and labels in the serialised payload', () => {
    const { init } = buildRequest(params({ body: 'details', labels: ['bug'] }), 'tok');
    expect(JSON.parse(init.body)).toEqual({ title: 'Bug: things are broken', body: 'details', labels: ['bug'] });
  });
});
