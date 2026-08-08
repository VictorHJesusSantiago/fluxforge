import type { GithubIssueParams } from './schema.js';

/**
 * The pure half of this node: building the GitHub REST API request to create an issue, kept
 * apart from `runtime.ts` so it's unit-testable with no mocked `fetch` at all.
 */

export function buildIssueUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
}

export interface IssuePayload {
  title: string;
  body?: string;
  labels?: string[];
}

export function buildIssuePayload(params: GithubIssueParams): IssuePayload {
  const payload: IssuePayload = { title: params.title };
  if (params.body !== undefined) payload.body = params.body;
  if (params.labels.length > 0) payload.labels = params.labels;
  return payload;
}

export interface BuiltRequest {
  url: string;
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  };
}

/**
 * GitHub's current REST API contract: a bearer token and `Accept: application/vnd.github+json`
 * (their versioned-response-format media type — https://docs.github.com/en/rest/using-the-rest-api).
 */
export function buildRequest(params: GithubIssueParams, token: string): BuiltRequest {
  return {
    url: buildIssueUrl(params.owner, params.repo),
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildIssuePayload(params)),
    },
  };
}
