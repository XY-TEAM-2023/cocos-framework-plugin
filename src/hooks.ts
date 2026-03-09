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
import { loadR2Config, isR2Configured } from './r2';
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
 * 从 bundle 自身的 config*.json 中读取场景入口名称
 * 开启 MD5 后文件名为 config.{hash}.json
 */
function getBundleEntryScene(bundleDir: string): string {
    // 查找 config.json / config.{md5}.json（Web）或 cc.config.{md5}.json（Android/Native）
    const files = fs.readdirSync(bundleDir);
    const configFile = files.find(f => /^(cc\.)?config(\.[0-9a-fA-F]+)?\.json$/.test(f));
    if (!configFile) return '';

    try {
        const config = JSON.parse(fs.readFileSync(path.join(bundleDir, configFile), 'utf-8'));
        const scenes = config.scenes;
        if (!scenes || typeof scenes !== 'object') return '';

        const sceneUrls = Object.keys(scenes);
        if (sceneUrls.length === 0) return '';

        // 取第一个场景的文件名（不含 .scene 后缀）
        return path.basename(sceneUrls[0], '.scene');
    } catch (e) {
        console.warn(`[Manifest] 读取 ${bundleDir}/${configFile} 失败:`, e);
        return '';
    }
}

/**
 * 将 bundle 目录重组为版本化 CDN 结构：
 *   bundleDir/          →  bundleDir/version     （纯文本，内容为版本号）
 *                          bundleDir/{version}/   （所有资源文件）
 */
function restructureBundleDir(bundleDir: string, version: string): void {
    const parentDir = path.dirname(bundleDir);
    const bundleName = path.basename(bundleDir);
    const tmpDir = path.join(parentDir, `${bundleName}_restructure_tmp`);

    // 1. 将原 bundleDir 整体重命名为临时目录
    fs.renameSync(bundleDir, tmpDir);

    // 2. 重建 bundleDir 并在其下创建版本号子目录
    fs.mkdirSync(bundleDir, { recursive: true });
    const versionDir = path.join(bundleDir, version);

    // 3. 将临时目录移入版本号子目录
    fs.renameSync(tmpDir, versionDir);

    // 4. 写入 version 文件
    fs.writeFileSync(path.join(bundleDir, 'version'), version, 'utf-8');

    console.log(`[Manifest] 📁 ${bundleName}/ → ${bundleName}/version + ${bundleName}/${version}/`);
}



/** 递归复制目录 */
function copyDirRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 将构建产物按平台整理到 projectRoot/build_upload_assets/{平台名} 下
 *
 * - web-mobile / web-desktop：直接复制整个 buildDest
 * - android：仅复制 buildDest/data/remote 中的内容
 * - 其他平台：输出提示暂未完成
 */
function copyToBuildUploadAssets(buildDest: string, projectRoot: string, version: string): void {
    const platformName = path.basename(buildDest);
    const uploadRoot = path.join(projectRoot, 'build_upload_assets');
    const targetDir = path.join(uploadRoot, platformName);

    console.log(`[BuildUpload] 开始整理 ${platformName} 产物到 ${targetDir}`);

    // 先清空目标目录（如果已存在）
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }

    if (platformName === 'web-mobile' || platformName === 'web-desktop') {
        // Web 平台：仅复制 remote/ 目录（App 产物由 copyAppArtifact 单独处理）
        const remoteDir = path.join(buildDest, 'remote');
        if (fs.existsSync(remoteDir)) {
            const remoteDest = path.join(targetDir, 'remote');
            fs.mkdirSync(targetDir, { recursive: true });
            copyDirRecursive(remoteDir, remoteDest);
            console.log(`[BuildUpload] ✅ 已复制 ${platformName}/remote 到 ${remoteDest}`);
        } else {
            console.warn(`[BuildUpload] ⚠️ 未找到 ${remoteDir}，跳过 remote 产物复制`);
        }
    } else if (platformName === 'android' || platformName === 'ios') {
        // Android：将 data/remote 目录复制到 build_upload_assets/android/remote
        const remoteDir = path.join(buildDest, 'data', 'remote');
        if (fs.existsSync(remoteDir)) {
            const remoteDest = path.join(targetDir, 'remote');
            fs.mkdirSync(targetDir, { recursive: true });
            copyDirRecursive(remoteDir, remoteDest);
            console.log(`[BuildUpload] ✅ 已复制 android/data/remote 到 ${remoteDest}`);
        } else {
            console.warn(`[BuildUpload] ⚠️ 未找到 ${remoteDir}，跳过 android 产物复制`);
        }
    } else {
        console.warn(`[BuildUpload] ⚠️ 暂未完成 ${platformName} 平台的 build_upload_assets 整理`);
    }

    // ====== App 产物收集 ======
    copyAppArtifact(buildDest, projectRoot, platformName, version);
}

/**
 * 收集 App 主体产物到 build_upload_assets/{platform}/app/{version}/
 */
function copyAppArtifact(buildDest: string, projectRoot: string, platformName: string, version: string): void {
    const uploadRoot = path.join(projectRoot, 'build_upload_assets');
    const appVersionDir = path.join(uploadRoot, platformName, 'app', version);

    if (platformName === 'android') {
        // Android: 复制 APK
        const releaseDir = path.join(buildDest, 'publish', 'release');
        if (!fs.existsSync(releaseDir)) {
            console.warn(`[BuildUpload] ⚠️ 未找到 ${releaseDir}，跳过 Android APK 收集`);
            return;
        }
        const apkFiles = fs.readdirSync(releaseDir).filter(f => f.endsWith('.apk'));
        if (apkFiles.length === 0) {
            console.warn(`[BuildUpload] ⚠️ ${releaseDir} 中未找到 APK 文件`);
            return;
        }
        fs.mkdirSync(appVersionDir, { recursive: true });
        const srcApk = path.join(releaseDir, apkFiles[0]);
        const destApk = path.join(appVersionDir, 'app.apk');
        fs.copyFileSync(srcApk, destApk);
        // 写入 manifest
        fs.writeFileSync(path.join(appVersionDir, 'manifest.json'), JSON.stringify({ version }, null, 2), 'utf-8');
        console.log(`[BuildUpload] ✅ 已复制 APK → ${destApk}`);

    } else if (platformName === 'web-mobile' || platformName === 'web-desktop') {
        // Web: 复制整个构建目录，删除 remote/
        fs.mkdirSync(appVersionDir, { recursive: true });
        copyDirRecursive(buildDest, appVersionDir);
        // 删除 remote 目录（bundle 已在 remote/ 单独管理）
        const remoteInApp = path.join(appVersionDir, 'remote');
        if (fs.existsSync(remoteInApp)) {
            fs.rmSync(remoteInApp, { recursive: true, force: true });
            console.log(`[BuildUpload] 已删除 app 产物中的 remote/ 目录`);
        }
        // 写入 manifest
        fs.writeFileSync(path.join(appVersionDir, 'manifest.json'), JSON.stringify({ version }, null, 2), 'utf-8');
        console.log(`[BuildUpload] ✅ 已复制 ${platformName} App 产物 → ${appVersionDir}`);

    } else if (platformName === 'ios') {
        console.warn(`[BuildUpload] ⚠️ iOS App 产物收集功能暂未实现（需要 Xcode 归档）`);

    } else {
        console.warn(`[BuildUpload] ⚠️ ${platformName} 平台 App 产物收集暂未实现`);
    }
}

export async function onAfterBuild(options: IBuildTaskOptions, result?: IBuildResult) {
    try {
        console.log('[Manifest] ========== onAfterBuild: 开始生成 manifest ==========');

        // ──── 诊断日志: 打印所有可用参数 ────
        console.log('[Manifest] options keys:', Object.keys(options).join(', '));
        console.log('[Manifest] options.buildPath:', options.buildPath);
        console.log('[Manifest] options.outputName:', options.outputName);
        console.log('[Manifest] options.platform:', (options as any).platform);
        console.log('[Manifest] options.platformType:', (options as any).platformType);
        if (result) {
            console.log('[Manifest] result keys:', Object.keys(result).join(', '));
            console.log('[Manifest] result.dest:', result.dest);
        } else {
            console.log('[Manifest] result is undefined');
        }

        const buildDest = result?.dest || path.join(options.buildPath, options.outputName);
        console.log(`[Manifest] buildDest=${buildDest}`);

        // 尝试多个候选路径查找 remote 目录
        const candidates = [
            path.join(buildDest, 'remote'),                     // Web: build/web-mobile/remote
            path.join(buildDest, 'data', 'remote'),             // Native: build/android/data/remote
        ];
        console.log('[Manifest] 候选 remote 路径:');
        for (const c of candidates) {
            const resolved = path.resolve(c);
            console.log(`  ${resolved} → ${fs.existsSync(resolved) ? '✅ 存在' : '❌ 不存在'}`);
        }

        const remoteDir = candidates.map(c => path.resolve(c)).find(c => fs.existsSync(c));

        if (!remoteDir) {
            console.log('[Manifest] 未检测到 remote 目录，跳过 manifest 生成');
            return;
        }
        console.log(`[Manifest] 使用 remoteDir=${remoteDir}`);

        // remoteDir 的父级是平台构建目录的 data 或构建根，
        // 向上查找直到包含 .manifest-keys 或 package.json 的目录
        // 简化: remoteDir 一定在 build/{platform}/... 下，向上找 build/ 再上一级
        // Web:     remoteDir = build/web-mobile/remote       → 上2级 = 项目根
        // Native:  remoteDir = build/android/data/remote     → 上3级 = 项目根
        let projectRoot = path.resolve(remoteDir, '..', '..');
        // 如果还没到项目根(没有 package.json)，继续向上
        while (!fs.existsSync(path.join(projectRoot, 'package.json')) && projectRoot !== path.dirname(projectRoot)) {
            projectRoot = path.dirname(projectRoot);
        }
        console.log(`[Manifest] projectRoot=${projectRoot}`);
        const keyPair = getOrCreateKeyPair(projectRoot);
        const version = buildVersion();

        const bundleDirs = fs.readdirSync(remoteDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

        console.log(`[Manifest] 检测到 ${bundleDirs.length} 个远程 bundle：${bundleDirs.join(', ')}`);

        for (const bundleName of bundleDirs) {
            const bundleDir = path.join(remoteDir, bundleName);
            const allFiles = walkDir(bundleDir);

            // Web: config.{md5}.json  /  Android·Native: cc.config.{md5}.json
            const hasMd5Config = allFiles.some((f) => /^(cc\.)?config\.[0-9a-fA-F]+\.json$/.test(path.basename(f)));
            if (!hasMd5Config) {
                console.error(`[Manifest] ❌ Bundle [${bundleName}] 未开启 MD5 缓存！请在构建面板中勾选「MD5 缓存」后重新构建。`);
                continue;
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

            // 提取 config.{hash}.json 中的 MD5 哈希值
            const dirFiles = fs.readdirSync(bundleDir);
            // 兼容 Web（config.{md5}.json）和 Android/Native（cc.config.{md5}.json）
            const configFileName = dirFiles.find(f => /^(cc\.)?config\.[0-9a-fA-F]+\.json$/.test(f)) || '';
            const md5Match = configFileName.match(/^(?:cc\.)?config\.([0-9a-fA-F]+)\.json$/);
            const configHash = md5Match ? md5Match[1] : '';

            const manifest: Record<string, any> = {
                version,
                entry: {
                    bundleName,
                    entryScene,
                    configHash,
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

            // 重组目录结构：bundleDir/ → bundleDir/version + bundleDir/{version}/
            restructureBundleDir(bundleDir, version);
        }


        console.log('[Manifest] ========== manifest 生成完成 ✅ ==========');

        // 整理构建产物到 build_upload_assets
        copyToBuildUploadAssets(buildDest, projectRoot, version);

        // 构建后自动询问上传 R2
        try {
            const r2Config = loadR2Config(projectRoot);
            if (r2Config?.autoPromptAfterBuild && isR2Configured(r2Config)) {
                const platformName = path.basename(buildDest);
                Editor.Message.send('framework-plugin', 'prompt-upload-after-build', JSON.stringify({
                    platformName,
                    version,
                    bundleNames: bundleDirs,
                }));
                console.log('[Manifest] 已触发 R2 上传询问');
            }
        } catch (r2Err) {
            console.warn('[Manifest] R2 上传询问触发失败:', r2Err);
        }
    } catch (err) {
        console.error('[Manifest] ❌ onAfterBuild 执行出错:', err);
    }
}

