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


import * as fs from 'fs';
import * as path from 'path';

let crypto: any;
try {
    crypto = require('crypto');
} catch (e) {
    console.error('[Manifest] ❌ crypto 模块加载失败:', e);
}


interface IBuildTaskOptions {
    buildPath: string;
    outputName: string;
    startScene: string;
    scenes: Array<{ url: string; uuid: string }>;
    [key: string]: any;
}

interface IBuildResult {
    dest: string;
    [key: string]: any;
}

const KEY_DIR_NAME = '.manifest-keys';

interface KeyPair {
    privateKey: any;
    publicKey: any;
}

function getOrCreateKeyPair(projectRoot: string): KeyPair {
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

    fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, 'utf-8');
    fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }) as string, 'utf-8');

    console.log(`[Manifest] ✅ 已生成 ed25519 密钥对 → ${keyDir}`);
    console.log(`[Manifest] ⚠️  请将 ${KEY_DIR_NAME}/ 加入 .gitignore 并妥善保管私钥`);

    return { privateKey, publicKey };
}

function walkDir(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        } else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results;
}

function hashFile(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

/** 生成中国时间格式版本号：yyMMddHHmmss */
function buildVersion(): string {
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

function signManifest(payload: string, privateKey: any): string {
    const signature = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey);
    return signature.toString('base64');
}

/**
 * 从 bundle 自身的 config.json 中读取场景入口名称
 * config.json 中的 scenes 字段格式：{ "db://assets/.../xxx.scene": number }
 */
function getBundleEntryScene(bundleDir: string): string {
    const configPath = path.join(bundleDir, 'config.json');
    if (!fs.existsSync(configPath)) return '';

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const scenes = config.scenes;
        if (!scenes || typeof scenes !== 'object') return '';

        const sceneUrls = Object.keys(scenes);
        if (sceneUrls.length === 0) return '';

        // 取第一个场景的文件名（不含 .scene 后缀）
        return path.basename(sceneUrls[0], '.scene');
    } catch (e) {
        console.warn(`[Manifest] 读取 ${bundleDir}/config.json 失败:`, e);
        return '';
    }
}

function copyServiceWorker(buildDest: string): void {
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

export async function onAfterBuild(options: IBuildTaskOptions, result?: IBuildResult) {
    try {
        console.log('[Manifest] ========== onAfterBuild: 开始生成 manifest ==========');

        const buildDest = result?.dest || path.join(options.buildPath, options.outputName);
        const remoteDir = path.join(buildDest, 'remote');

        if (!fs.existsSync(remoteDir)) {
            console.log('[Manifest] 未检测到 remote 目录，跳过 manifest 生成');
            copyServiceWorker(buildDest);
            return;
        }

        const projectRoot = path.resolve(buildDest, '..', '..');
        const keyPair = getOrCreateKeyPair(projectRoot);
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
            const fileEntries: Array<{ path: string; sizeBytes: number; hash: string }> = [];

            for (const filePath of files) {
                const stat = fs.statSync(filePath);
                const relativePath = path.relative(bundleDir, filePath).split(path.sep).join('/');
                const hash = hashFile(filePath);

                fileEntries.push({
                    path: relativePath,
                    sizeBytes: stat.size,
                    hash,
                });

                totalBytes += stat.size;
            }

            const entryScene = getBundleEntryScene(bundleDir);

            const manifest: Record<string, any> = {
                version,
                entry: {
                    bundleName,
                    entryScene,
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
                (globalThis as any).Editor?.Message?.send('framework-plugin', 'show-md5-warning');
            } catch (e) {
                console.error('[Manifest] 发送 MD5 警告失败', e);
            }
        }

        copyServiceWorker(buildDest);
        console.log('[Manifest] ========== manifest 生成完成 ✅ ==========');
    } catch (err) {
        console.error('[Manifest] ❌ onAfterBuild 执行出错:', err);
    }
}

