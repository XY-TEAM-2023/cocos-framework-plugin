/**
 * Build Hooks — onAfterBuild
 *
 * 构建完成后扫描 remote 产物目录，为每个 bundle 生成 manifest.json：
 *   - 文件列表（相对路径、大小、SHA-256 哈希）
 *   - 汇总信息（文件数、总字节、哈希算法）
 *   - 入口信息（bundleName、entryScene）
 *   - 构建时间版本号（中国时间 yyMMddHHmmss）
 *   - ed25519 签名
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ────────────────────────────────────────────
// 类型（仅声明本插件使用到的字段）
// ────────────────────────────────────────────

interface IBuildTaskOptions {
    buildPath: string;   // 构建根路径
    outputName: string;  // 输出文件夹名
    startScene: string;  // 入口场景 UUID
    scenes: Array<{ url: string; uuid: string }>; // 参与构建的场景列表
    bundles?: Array<{
        name: string;
        dest?: string;
        root?: string;
    }>;
    packages?: Record<string, any>;
    [key: string]: any;
}

interface IBuildResult {
    dest: string; // 最终输出绝对路径
    [key: string]: any;
}

// ────────────────────────────────────────────
// ed25519 密钥管理
// ────────────────────────────────────────────

const KEY_DIR_NAME = '.manifest-keys';

interface KeyPair {
    privateKey: crypto.KeyObject;
    publicKey: crypto.KeyObject;
}

/**
 * 获取或生成 ed25519 密钥对
 * 密钥存储在项目根目录的 .manifest-keys/ 目录中
 */
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

    // 首次生成
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

// ────────────────────────────────────────────
// 工具函数
// ────────────────────────────────────────────

/**
 * 递归遍历目录，返回所有文件的绝对路径
 */
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

/**
 * 计算文件的 SHA-256 哈希
 */
function hashFile(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 生成中国时间格式的版本号：yyMMddHHmmss
 * 例如：260304092000
 */
function buildVersion(): string {
    // 使用中国标准时间 (UTC+8)
    const now = new Date();
    const cnOffset = 8 * 60; // 分钟
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

/**
 * 对 manifest JSON 内容（不含 signature 字段）进行 ed25519 签名
 */
function signManifest(payload: string, privateKey: crypto.KeyObject): string {
    const signature = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey);
    return signature.toString('base64');
}

/**
 * 从场景列表中查找入口场景的显示名
 */
function getEntrySceneName(
    startSceneUuid: string,
    scenes?: Array<{ url: string; uuid: string }>,
): string {
    if (!scenes || !startSceneUuid) return '';

    for (const s of scenes) {
        if (s.uuid === startSceneUuid) {
            // url 格式通常为 "db://assets/xxx/SceneName.scene"
            const baseName = path.basename(s.url, '.scene');
            return baseName;
        }
    }
    return '';
}

// ────────────────────────────────────────────
// Build Hook
// ────────────────────────────────────────────

export async function onAfterBuild(options: IBuildTaskOptions, result?: IBuildResult) {
    console.log('[Manifest] ========== onAfterBuild: 开始生成 manifest ==========');

    // 确定输出根目录
    const buildDest = result?.dest || path.join(options.buildPath, options.outputName);
    const remoteDir = path.join(buildDest, 'remote');

    if (!fs.existsSync(remoteDir)) {
        console.log('[Manifest] 未检测到 remote 目录，跳过 manifest 生成');
        return;
    }

    // 获取项目根路径（从构建路径向上推断）
    // buildDest 通常为 <project>/build/<platform>
    const projectRoot = path.resolve(buildDest, '..', '..');
    const keyPair = getOrCreateKeyPair(projectRoot);

    // 入口场景信息
    const entrySceneName = getEntrySceneName(options.startScene, options.scenes);
    const version = buildVersion();

    // 扫描 remote 下的每个 bundle 目录
    const bundleDirs = fs.readdirSync(remoteDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    console.log(`[Manifest] 检测到 ${bundleDirs.length} 个远程 bundle：${bundleDirs.join(', ')}`);

    let md5Detected = false;

    for (const bundleName of bundleDirs) {
        const bundleDir = path.join(remoteDir, bundleName);
        const allFiles = walkDir(bundleDir);

        // 检测是否有带 MD5 后缀的 config.json (例如 config.26c77.json)
        const hasMd5Config = allFiles.some(f => {
            const basename = path.basename(f);
            return /^config\.[0-9a-fA-F]+\.json$/.test(basename);
        });
        
        if (hasMd5Config) {
            md5Detected = true;
            console.warn(`[Manifest] ⚠️ 检测到 Bundle [${bundleName}] 开启了 MD5 缓存！`);
        }

        // 排除已有的 manifest.json
        const files = allFiles.filter(f => path.basename(f) !== 'manifest.json');

        let totalBytes = 0;
        const fileEntries: Array<{
            path: string;
            sizeBytes: number;
            hash: string;
        }> = [];

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

        // 构造 manifest 对象（不含 signature）
        const manifest: Record<string, any> = {
            version,
            entry: {
                bundleName,
                entryScene: entrySceneName,
            },
            files: fileEntries,
        };

        // 签名
        const payloadStr = JSON.stringify(manifest, null, 2);
        manifest.signature = signManifest(payloadStr, keyPair.privateKey);

        // 写入 manifest.json
        const manifestPath = path.join(bundleDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        console.log(`[Manifest] ✅ ${bundleName}/manifest.json （${fileEntries.length} 个文件, ${(totalBytes / 1024).toFixed(1)} KB）`);
    }

    if (md5Detected) {
        try {
            // 向主进程发送消息以弹出警告对话框
            (globalThis as any).Editor?.Message?.send('framework-plugin', 'show-md5-warning');
        } catch (e) {
            console.error('[Manifest] 发送 MD5 警告失败', e);
        }
    }

    console.log('[Manifest] ========== manifest 生成完成 ✅ ==========');
}
