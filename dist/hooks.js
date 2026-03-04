"use strict";
/**
 * Build Hooks — onAfterBuild
 *
 * 构建完成后扫描 remote 产物目录，为每个 bundle 生成 manifest.json：
 *   - 文件列表（相对路径、大小、SHA-256 哈希）
 *   - 汇总信息（文件数、总字节、哈希算法）
 *   - 入口信息（bundleName、entryScene）
 *   - 构建时间版本号（中国时间 yyMMddHHmmss）
 *   - ed25519 签名
 *
 * 并在 Web 构建产物根目录复制 sw-bundle-cache.js。
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAfterBuild = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const KEY_DIR_NAME = '.manifest-keys';
function getOrCreateKeyPair(projectRoot) {
    const keyDir = path.join(projectRoot, KEY_DIR_NAME);
    const privPath = path.join(keyDir, 'ed25519.pem');
    const pubPath = path.join(keyDir, 'ed25519_pub.pem');
    if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
        return {
            privateKey: crypto.createPrivateKey(fs.readFileSync(privPath, 'utf-8')),
            publicKey: crypto.createPublicKey(fs.readFileSync(pubPath, 'utf-8')),
        };
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    if (!fs.existsSync(keyDir)) {
        fs.mkdirSync(keyDir, { recursive: true });
    }
    fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf-8');
    fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }), 'utf-8');
    console.log(`[Manifest] ✅ 已生成 ed25519 密钥对 → ${keyDir}`);
    console.log(`[Manifest] ⚠️  请将 ${KEY_DIR_NAME}/ 加入 .gitignore 并妥善保管私钥`);
    return { privateKey, publicKey };
}
function walkDir(dir) {
    const results = [];
    if (!fs.existsSync(dir))
        return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        }
        else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results;
}
function hashFile(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}
/** 生成中国时间格式版本号：yyMMddHHmmss */
function buildVersion() {
    const now = new Date();
    const cnOffset = 8 * 60;
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const cnTime = new Date(utc + cnOffset * 60000);
    const yy = String(cnTime.getFullYear()).slice(-2);
    const MM = String(cnTime.getMonth() + 1).padStart(2, '0');
    const dd = String(cnTime.getDate()).padStart(2, '0');
    const HH = String(cnTime.getHours()).padStart(2, '0');
    const mm = String(cnTime.getMinutes()).padStart(2, '0');
    const ss = String(cnTime.getSeconds()).padStart(2, '0');
    return `${yy}${MM}${dd}${HH}${mm}${ss}`;
}
function signManifest(payload, privateKey) {
    const signature = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey);
    return signature.toString('base64');
}
function getEntrySceneName(startSceneUuid, scenes) {
    if (!scenes || !startSceneUuid)
        return '';
    for (const s of scenes) {
        if (s.uuid === startSceneUuid) {
            return path.basename(s.url, '.scene');
        }
    }
    return '';
}
function copyServiceWorker(buildDest) {
    const distName = path.basename(buildDest);
    if (!/^web-/i.test(distName) && distName !== 'web') {
        return;
    }
    const src = path.resolve(__dirname, '../runtime/sw-bundle-cache.js');
    if (!fs.existsSync(src)) {
        console.warn(`[Manifest] 未找到 SW 模板，跳过复制: ${src}`);
        return;
    }
    const dest = path.join(buildDest, 'sw-bundle-cache.js');
    fs.copyFileSync(src, dest);
    console.log(`[Manifest] ✅ 已复制 Service Worker: ${dest}`);
}
async function onAfterBuild(options, result) {
    var _a, _b;
    console.log('[Manifest] ========== onAfterBuild: 开始生成 manifest ==========');
    const buildDest = (result === null || result === void 0 ? void 0 : result.dest) || path.join(options.buildPath, options.outputName);
    const remoteDir = path.join(buildDest, 'remote');
    if (!fs.existsSync(remoteDir)) {
        console.log('[Manifest] 未检测到 remote 目录，跳过 manifest 生成');
        copyServiceWorker(buildDest);
        return;
    }
    const projectRoot = path.resolve(buildDest, '..', '..');
    const keyPair = getOrCreateKeyPair(projectRoot);
    const entrySceneName = getEntrySceneName(options.startScene, options.scenes);
    const version = buildVersion();
    const bundleDirs = fs.readdirSync(remoteDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    console.log(`[Manifest] 检测到 ${bundleDirs.length} 个远程 bundle：${bundleDirs.join(', ')}`);
    let md5Detected = false;
    for (const bundleName of bundleDirs) {
        const bundleDir = path.join(remoteDir, bundleName);
        const allFiles = walkDir(bundleDir);
        const hasMd5Config = allFiles.some((f) => /^config\.[0-9a-fA-F]+\.json$/.test(path.basename(f)));
        if (hasMd5Config) {
            md5Detected = true;
            console.warn(`[Manifest] ⚠️ 检测到 Bundle [${bundleName}] 开启了 MD5 缓存！`);
        }
        const files = allFiles.filter((f) => path.basename(f) !== 'manifest.json');
        let totalBytes = 0;
        const fileEntries = [];
        for (const filePath of files) {
            const stat = fs.statSync(filePath);
            const relativePath = path.relative(buildDest, filePath).split(path.sep).join('/');
            const hash = hashFile(filePath);
            fileEntries.push({
                path: relativePath,
                sizeBytes: stat.size,
                hash,
            });
            totalBytes += stat.size;
        }
        const manifest = {
            version,
            entry: {
                bundleName,
                entryScene: entrySceneName,
            },
            summary: {
                totalFiles: fileEntries.length,
                totalBytes,
                hashAlgorithm: 'sha256',
            },
            files: fileEntries,
        };
        const payload = JSON.stringify(manifest, null, 2);
        manifest.signature = signManifest(payload, keyPair.privateKey);
        const manifestPath = path.join(bundleDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        console.log(`[Manifest] ✅ ${bundleName}/manifest.json （${fileEntries.length} 个文件, ${(totalBytes / 1024).toFixed(1)} KB）`);
    }
    if (md5Detected) {
        try {
            (_b = (_a = globalThis.Editor) === null || _a === void 0 ? void 0 : _a.Message) === null || _b === void 0 ? void 0 : _b.send('framework-plugin', 'show-md5-warning');
        }
        catch (e) {
            console.error('[Manifest] 发送 MD5 警告失败', e);
        }
    }
    copyServiceWorker(buildDest);
    console.log('[Manifest] ========== manifest 生成完成 ✅ ==========');
}
exports.onAfterBuild = onAfterBuild;
//# sourceMappingURL=hooks.js.map