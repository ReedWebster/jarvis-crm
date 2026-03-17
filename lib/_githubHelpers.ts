/**
 * GitHub API helpers — shared between api/github-sync.ts and inline briefing fetch.
 */

export interface GitHubActivity {
  lastSyncAt: string;
  recentCommits: Array<{ repo: string; message: string; date: string }>;
  openPRs: Array<{ repo: string; title: string; url: string }>;
  openIssues: Array<{ repo: string; title: string; url: string; labels: string[] }>;
}

async function githubFetch(path: string, token: string, timeoutMs = 5000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return res.json();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function fetchGitHubActivity(token: string): Promise<GitHubActivity> {
  const [repos, events] = await Promise.all([
    githubFetch('/user/repos?sort=pushed&per_page=10&type=owner', token),
    githubFetch('/users/' + (await githubFetch('/user', token))?.login + '/events?per_page=30', token),
  ]);

  // Extract recent commits from push events
  const recentCommits: GitHubActivity['recentCommits'] = [];
  if (Array.isArray(events)) {
    for (const event of events) {
      if (event.type === 'PushEvent' && event.payload?.commits) {
        for (const commit of event.payload.commits) {
          recentCommits.push({
            repo: event.repo?.name ?? 'unknown',
            message: (commit.message ?? '').split('\n')[0].slice(0, 100),
            date: event.created_at ?? '',
          });
        }
      }
    }
  }

  // Fetch open PRs and issues for the most active repos
  const repoNames = Array.isArray(repos) ? repos.slice(0, 5).map((r: any) => r.full_name) : [];
  const openPRs: GitHubActivity['openPRs'] = [];
  const openIssues: GitHubActivity['openIssues'] = [];

  await Promise.all(repoNames.map(async (fullName: string) => {
    const [prs, issues] = await Promise.all([
      githubFetch(`/repos/${fullName}/pulls?state=open&per_page=5`, token),
      githubFetch(`/repos/${fullName}/issues?state=open&per_page=5`, token),
    ]);
    if (Array.isArray(prs)) {
      for (const pr of prs) {
        openPRs.push({
          repo: fullName,
          title: pr.title ?? '',
          url: pr.html_url ?? '',
        });
      }
    }
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        // GitHub issues API also returns PRs — skip those
        if (issue.pull_request) continue;
        openIssues.push({
          repo: fullName,
          title: issue.title ?? '',
          url: issue.html_url ?? '',
          labels: (issue.labels ?? []).map((l: any) => l.name ?? ''),
        });
      }
    }
  }));

  return {
    lastSyncAt: new Date().toISOString(),
    recentCommits: recentCommits.slice(0, 15),
    openPRs: openPRs.slice(0, 10),
    openIssues: openIssues.slice(0, 10),
  };
}
