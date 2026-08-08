import { z } from '@fluxforge/sdk';

export const githubIssueParamsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  labels: z.array(z.string()).default([]),
});

export type GithubIssueParams = z.infer<typeof githubIssueParamsSchema>;
