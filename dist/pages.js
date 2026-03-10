"use strict";
/**
 * Cloudflare Pages Core Module
 *
 * 封装 Pages API 操作：
 *   - 配置读写（.pagesconfig.json）
 *   - 部署（R2 → 临时目录 → wrangler pages deploy）
 *   - 列出部署
 *   - 回滚
 *   - 删除部署
 *   - 列出 R2 中的 app 版本
 */
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testPagesConnection = exports.deleteDeployment = exports.rollbackDeployment = exports.listDeployments = exports.deployFromR2 = exports.listR2AppVersions = exports.getAvailableEnvironments = exports.isEnvConfigured = exports.isPagesConfigured = exports.savePagesConfig = exports.loadPagesConfig = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const client_s3_1 = require("@aws-sdk/client-s3");
// ==================== 配置管理 ====================
const CONFIG_FILE = '.pagesconfig.json';
function getConfigPath(projectRoot) {
    return path.join(projectRoot, CONFIG_FILE);
}
function loadPagesConfig(projectRoot) {
    const configPath = getConfigPath(projectRoot);
    if (!fs.existsSync(configPath))
        return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (_a) {
        return null;
    }
}
exports.loadPagesConfig = loadPagesConfig;
function savePagesConfig(projectRoot, config) {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
exports.savePagesConfig = savePagesConfig;
function isPagesConfigured(config) {
    return !!(config && config.pagesApiToken);
}
exports.isPagesConfigured = isPagesConfigured;
function isEnvConfigured(config, env) {
    var _a;
    if (!config)
        return false;
    const proj = (_a = config.pagesProjects) === null || _a === void 0 ? void 0 : _a[env];
    return !!(proj && proj.projectName);
}
exports.isEnvConfigured = isEnvConfigured;
/** 获取可用环境列表 */
function getAvailableEnvironments(config) {
    const envs = [
        { env: 'production', label: '正式' },
        { env: 'staging', label: '预览' },
        { env: 'dev', label: '开发' },
    ];
    return envs.map(e => {
        var _a;
        const proj = (_a = config === null || config === void 0 ? void 0 : config.pagesProjects) === null || _a === void 0 ? void 0 : _a[e.env];
        return Object.assign(Object.assign({}, e), { projectName: (proj === null || proj === void 0 ? void 0 : proj.projectName) || '', domain: (proj === null || proj === void 0 ? void 0 : proj.domain) || '', configured: !!(proj && proj.projectName) });
    });
}
exports.getAvailableEnvironments = getAvailableEnvironments;
// ==================== R2 App 版本列出 ====================
/** 列出 R2 中的 app 版本 */
async function listR2AppVersions(client, bucket, platform = 'web-mobile') {
    const prefix = `${platform}/app/`;
    const versions = new Set();
    let continuationToken;
    do {
        const resp = await client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            Delimiter: '/',
            ContinuationToken: continuationToken,
        }));
        if (resp.CommonPrefixes) {
            for (const cp of resp.CommonPrefixes) {
                if (cp.Prefix) {
                    const ver = cp.Prefix.replace(prefix, '').replace(/\/$/, '');
                    if (ver)
                        versions.add(ver);
                }
            }
        }
        continuationToken = resp.NextContinuationToken;
    } while (continuationToken);
    return Array.from(versions).sort().reverse();
}
exports.listR2AppVersions = listR2AppVersions;
/** 列出 R2 中某个 app 版本的所有文件 key */
async function listR2AppFiles(client, bucket, platform, version) {
    const prefix = `${platform}/app/${version}/`;
    const keys = [];
    let continuationToken;
    do {
        const resp = await client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }));
        if (resp.Contents) {
            for (const obj of resp.Contents) {
                if (obj.Key && !obj.Key.endsWith('/')) {
                    keys.push(obj.Key);
                }
            }
        }
        continuationToken = resp.NextContinuationToken;
    } while (continuationToken);
    return keys;
}
// ==================== 部署 ====================
function runCmd(cmd, options) {
    return new Promise((resolve, reject) => {
        const mergedEnv = Object.assign(Object.assign(Object.assign({}, process.env), { HOME: process.env.HOME || os.homedir(), PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' }), options === null || options === void 0 ? void 0 : options.env);
        (0, child_process_1.exec)(cmd, {
            cwd: options === null || options === void 0 ? void 0 : options.cwd,
            maxBuffer: 10 * 1024 * 1024,
            env: mergedEnv,
            shell: '/bin/zsh',
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            }
            else {
                resolve(stdout.trim());
            }
        });
    });
}
/** 从 R2 下载指定版本并部署到 Pages */
async function deployFromR2(options) {
    var _a, e_1, _b, _c;
    const { r2Client, r2Bucket, version, env, commitMessage, config, accountId, onLog } = options;
    const projectName = config.pagesProjects[env].projectName;
    const platform = 'web-mobile';
    const prefix = `${platform}/app/${version}/`;
    const tmpDir = path.join(os.tmpdir(), `pages-deploy-${version}-${Date.now()}`);
    try {
        // 1. 列出文件
        onLog(`[Pages] 正在扫描 R2: ${prefix} ...`);
        const keys = await listR2AppFiles(r2Client, r2Bucket, platform, version);
        if (keys.length === 0) {
            return { success: false, error: `R2 中未找到版本 ${version} 的文件` };
        }
        onLog(`[Pages] 发现 ${keys.length} 个文件`);
        // 2. 下载到临时目录
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const relativePath = key.replace(prefix, '');
            onLog(`[Pages] 下载 (${i + 1}/${keys.length}) ${relativePath}`);
            const localPath = path.join(tmpDir, relativePath);
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            const obj = await r2Client.send(new client_s3_1.GetObjectCommand({ Bucket: r2Bucket, Key: key }));
            if (obj.Body) {
                const chunks = [];
                try {
                    for (var _d = true, _e = (e_1 = void 0, __asyncValues(obj.Body)), _f; _f = await _e.next(), _a = _f.done, !_a;) {
                        _c = _f.value;
                        _d = false;
                        try {
                            const chunk = _c;
                            chunks.push(Buffer.from(chunk));
                        }
                        finally {
                            _d = true;
                        }
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (!_d && !_a && (_b = _e.return)) await _b.call(_e);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                fs.writeFileSync(localPath, Buffer.concat(chunks));
            }
        }
        onLog(`[Pages] 全部下载完成`, 'success');
        // 3. 注入 env.json（客户端根据此文件判断运行环境）
        const envMap = {
            'production': 'prod',
            'staging': 'beta',
            'dev': 'dev',
        };
        const appEnv = envMap[env] || 'dev';
        fs.writeFileSync(path.join(tmpDir, 'env.json'), JSON.stringify({ env: appEnv }));
        onLog(`[Pages] ✅ 已注入 env.json → { "env": "${appEnv}" }`);
        // 4. 部署到 Pages
        onLog(`[Pages] 正在部署到 Pages (项目: ${projectName}) ...`);
        // wrangler 需要 .wrangler/cache 目录
        fs.mkdirSync(path.join(tmpDir, '.wrangler', 'cache'), { recursive: true });
        // 在 commit message 前添加 R2 版本号前缀
        const fullMsg = `【R2-${version}】${commitMessage}`;
        const escapedMsg = fullMsg.replace(/"/g, '\\"');
        const cmd = `npx wrangler pages deploy .`
            + ` --project-name="${projectName}"`
            + ` --branch="main"`
            + ` --commit-message="${escapedMsg}"`;
        const output = await runCmd(cmd, {
            cwd: tmpDir,
            env: {
                CLOUDFLARE_API_TOKEN: config.pagesApiToken,
                CLOUDFLARE_ACCOUNT_ID: accountId,
            },
        });
        onLog(`[Pages] wrangler 输出: ${output}`);
        // 4. 清理
        fs.rmSync(tmpDir, { recursive: true, force: true });
        onLog(`[Pages] 部署成功，临时文件已清理`, 'success');
        // 提取 URL
        const urlMatch = output.match(/https:\/\/[^\s]+\.pages\.dev/);
        return { success: true, url: urlMatch ? urlMatch[0] : undefined };
    }
    catch (e) {
        onLog(`[Pages] 部署失败: ${e.message}`, 'error');
        // 清理临时目录
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        catch (_g) { }
        onLog(`[Pages] 临时文件已清理`);
        return { success: false, error: e.message };
    }
}
exports.deployFromR2 = deployFromR2;
// ==================== Pages API ====================
const API_BASE = 'https://api.cloudflare.com/client/v4';
async function pagesApiFetch(apiToken, accountId, projectName, endpoint = '', method = 'GET', params) {
    var _a;
    let url = `${API_BASE}/accounts/${accountId}/pages/projects/${projectName}/deployments${endpoint}`;
    if (params) {
        const query = new URLSearchParams();
        for (const key in params) {
            query.append(key, String(params[key]));
        }
        url += `?${query.toString()}`;
    }
    const resp = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    });
    const json = await resp.json();
    if (!json.success) {
        const errMsg = ((_a = json.errors) === null || _a === void 0 ? void 0 : _a.map((e) => e.message).join(', ')) || 'Unknown error';
        throw new Error(errMsg);
    }
    return json;
}
/** Get the canonical (currently active) deployment ID from the project API */
async function getCanonicalDeploymentId(apiToken, accountId, projectName) {
    var _a, _b;
    try {
        const url = `${API_BASE}/accounts/${accountId}/pages/projects/${projectName}`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
        });
        const json = await resp.json();
        if (json.success && ((_b = (_a = json.result) === null || _a === void 0 ? void 0 : _a.canonical_deployment) === null || _b === void 0 ? void 0 : _b.id)) {
            return json.result.canonical_deployment.id;
        }
        return null;
    }
    catch (_c) {
        return null;
    }
}
/** 列出部署 */
async function listDeployments(apiToken, accountId, projectName, page = 1, perPage = 10) {
    // Fetch deployments and canonical deployment ID in parallel
    const [json, canonicalId] = await Promise.all([
        pagesApiFetch(apiToken, accountId, projectName, '', 'GET', {
            page,
            per_page: perPage,
        }),
        page === 1 ? getCanonicalDeploymentId(apiToken, accountId, projectName) : Promise.resolve(null),
    ]);
    const deployments = json.result || [];
    // Mark the canonical (currently active) deployment
    for (const d of deployments) {
        d.is_current = !!(canonicalId && d.id === canonicalId);
    }
    return deployments;
}
exports.listDeployments = listDeployments;
/** 回滚到指定部署 */
async function rollbackDeployment(apiToken, accountId, projectName, deploymentId) {
    await pagesApiFetch(apiToken, accountId, projectName, `/${deploymentId}/rollback`, 'POST');
}
exports.rollbackDeployment = rollbackDeployment;
/** 删除部署 */
async function deleteDeployment(apiToken, accountId, projectName, deploymentId) {
    await pagesApiFetch(apiToken, accountId, projectName, `/${deploymentId}?force=true`, 'DELETE');
}
exports.deleteDeployment = deleteDeployment;
/** 测试 Pages API 连接 */
async function testPagesConnection(apiToken, accountId, projectName) {
    try {
        await pagesApiFetch(apiToken, accountId, projectName);
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message || String(e) };
    }
}
exports.testPagesConnection = testPagesConnection;
//# sourceMappingURL=pages.js.map