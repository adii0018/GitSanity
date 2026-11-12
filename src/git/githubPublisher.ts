import * as https from 'https';

export function validateRepoName(name: string): string | undefined {
  if (!name || name.trim().length === 0) {
    return 'Repository name cannot be empty.';
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name.trim())) {
    return 'Repository name must be 1-100 characters containing only letters, numbers, hyphens, periods, or underscores.';
  }
  return undefined;
}

export function mapGitHubError(status: number, body: any): string {
  if (status === 401) {
    return 'GitHub authentication expired or invalid. Please sign in again.';
  }
  if (status === 403) {
    return 'GitHub permission denied. Check your token scopes (repo permission required).';
  }
  if (status === 422) {
    const msg = body?.message || '';
    const errs = Array.isArray(body?.errors) ? body.errors.map((e: any) => e.message || '').join(' ') : '';
    if (msg.includes('already exists') || errs.includes('already exists') || msg.includes('name already exists')) {
      return 'A repository with this name already exists on your GitHub account.';
    }
    return `Validation failed: ${msg || errs || 'invalid repository details.'}`;
  }
  return `GitHub API error (${status}): ${body?.message || 'unknown error'}`;
}

export type HttpsJsonFunction = (
  options: https.RequestOptions,
  body?: any
) => Promise<{ status: number; body: any }>;

/**
 * Performs an HTTPS request and parses JSON response using Node's built-in https module.
 */
export const defaultHttpsJson: HttpsJsonFunction = (options, postData) => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed: any = null;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch {
          parsed = { raw: data };
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
};

export interface CreateGitHubRepoOptions {
  token: string;
  name: string;
  isPrivate: boolean;
  httpsJsonFn?: HttpsJsonFunction;
}

export async function createGitHubRepo(opts: CreateGitHubRepoOptions): Promise<{ cloneUrl: string; htmlUrl: string }> {
  const httpsFn = opts.httpsJsonFn || defaultHttpsJson;

  const requestOptions: https.RequestOptions = {
    hostname: 'api.github.com',
    port: 443,
    path: '/user/repos',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GitSanity-VSCode',
      'Content-Type': 'application/json'
    }
  };

  const payload = {
    name: opts.name,
    private: opts.isPrivate,
    auto_init: false
  };

  const res = await httpsFn(requestOptions, payload);
  if (res.status !== 201) {
    const errorMsg = mapGitHubError(res.status, res.body);
    throw new Error(errorMsg);
  }

  const cloneUrl = res.body?.clone_url;
  const htmlUrl = res.body?.html_url || `https://github.com/${opts.name}`;

  if (!cloneUrl) {
    throw new Error('GitHub created repository but did not return a clone_url.');
  }

  return { cloneUrl, htmlUrl };
}
