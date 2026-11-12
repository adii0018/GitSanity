"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultHttpsJson = void 0;
exports.validateRepoName = validateRepoName;
exports.mapGitHubError = mapGitHubError;
exports.createGitHubRepo = createGitHubRepo;
const https = __importStar(require("https"));
function validateRepoName(name) {
    if (!name || name.trim().length === 0) {
        return 'Repository name cannot be empty.';
    }
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name.trim())) {
        return 'Repository name must be 1-100 characters containing only letters, numbers, hyphens, periods, or underscores.';
    }
    return undefined;
}
function mapGitHubError(status, body) {
    if (status === 401) {
        return 'GitHub authentication expired or invalid. Please sign in again.';
    }
    if (status === 403) {
        return 'GitHub permission denied. Check your token scopes (repo permission required).';
    }
    if (status === 422) {
        const msg = body?.message || '';
        const errs = Array.isArray(body?.errors) ? body.errors.map((e) => e.message || '').join(' ') : '';
        if (msg.includes('already exists') || errs.includes('already exists') || msg.includes('name already exists')) {
            return 'A repository with this name already exists on your GitHub account.';
        }
        return `Validation failed: ${msg || errs || 'invalid repository details.'}`;
    }
    return `GitHub API error (${status}): ${body?.message || 'unknown error'}`;
}
/**
 * Performs an HTTPS request and parses JSON response using Node's built-in https module.
 */
const defaultHttpsJson = (options, postData) => {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : {};
                }
                catch {
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
exports.defaultHttpsJson = defaultHttpsJson;
async function createGitHubRepo(opts) {
    const httpsFn = opts.httpsJsonFn || exports.defaultHttpsJson;
    const requestOptions = {
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
//# sourceMappingURL=githubPublisher.js.map