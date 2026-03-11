"use strict";
/**
 * iOS 多环境 IPA 构建模块
 *
 * 功能：
 * 1. 管理 iOS 签名配置（.iosconfig.json + .ios-signing/ 目录）
 * 2. 解析 .mobileprovision 文件提取签名信息
 * 3. 安装签名文件到系统（Provisioning Profiles + Keychain）
 * 4. 一次 Cocos 构建后，循环生成多个环境的 IPA
 *    - 写入 env.json → xcodebuild archive → xcodebuild export → 重命名 IPA
 *
 * 产出结构：
 *   build_upload_assets/ios/app/{version}/
 *   ├── app-dev.ipa
 *   ├── app-beta.ipa
 *   ├── app-prod.ipa
 *   └── manifest.json
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
exports.generateMultiEnvIpas = exports.findXcodeProject = exports.importP12ToKeychain = exports.installMobileProvision = exports.parseMobileProvision = exports.copySigningFile = exports.isSigningConfigured = exports.isEnvSigningConfigured = exports.isSharedSigningConfigured = exports.getEnabledIOSEnvironments = exports.getEffectiveIOSConfig = exports.saveIOSConfig = exports.loadIOSConfig = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// ==================== 配置管理 ====================
const CONFIG_FILE = '.iosconfig.json';
const SIGNING_DIR = '.ios-signing';
function getConfigPath(projectRoot) {
    return path.join(projectRoot, CONFIG_FILE);
}
function getSigningDir(projectRoot) {
    return path.join(projectRoot, SIGNING_DIR);
}
/** 默认的单个环境配置 */
function getDefaultEnvConfig(exportMethod) {
    return {
        enabled: true,
        exportMethod,
        mobileprovisionFile: '',
        profileName: '',
        profileUUID: '',
        bundleId: '',
    };
}
/** 默认配置 */
function getDefaultConfig() {
    return {
        shared: {
            p12File: '',
            p12Password: '',
            teamId: '',
        },
        environments: {
            dev: getDefaultEnvConfig('simulator'),
            beta: getDefaultEnvConfig('ad-hoc'),
            prod: getDefaultEnvConfig('app-store'),
        },
    };
}
/** 加载 iOS 打包配置 */
function loadIOSConfig(projectRoot) {
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
exports.loadIOSConfig = loadIOSConfig;
/** 保存 iOS 打包配置 */
function saveIOSConfig(projectRoot, config) {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
exports.saveIOSConfig = saveIOSConfig;
/** 获取有效配置（不存在配置文件时返回默认值） */
function getEffectiveIOSConfig(projectRoot) {
    return loadIOSConfig(projectRoot) || getDefaultConfig();
}
exports.getEffectiveIOSConfig = getEffectiveIOSConfig;
/** 获取启用的环境列表 */
function getEnabledIOSEnvironments(config) {
    var _a, _b, _c;
    const envs = [];
    if ((_a = config.environments.dev) === null || _a === void 0 ? void 0 : _a.enabled)
        envs.push('dev');
    if ((_b = config.environments.beta) === null || _b === void 0 ? void 0 : _b.enabled)
        envs.push('beta');
    if ((_c = config.environments.prod) === null || _c === void 0 ? void 0 : _c.enabled)
        envs.push('prod');
    return envs;
}
exports.getEnabledIOSEnvironments = getEnabledIOSEnvironments;
/** 检查共享签名配置是否完整（P12 + Team ID） */
function isSharedSigningConfigured(config) {
    const s = config.shared;
    return !!(s.p12File && s.p12Password && s.teamId);
}
exports.isSharedSigningConfigured = isSharedSigningConfigured;
/** 检查某个环境的签名配置是否完整（simulator 无需签名，始终返回 true） */
function isEnvSigningConfigured(envConfig) {
    if (envConfig.exportMethod === 'simulator')
        return true;
    return !!(envConfig.mobileprovisionFile && envConfig.profileUUID);
}
exports.isEnvSigningConfigured = isEnvSigningConfigured;
/** 检查签名配置是否完整（共享 + 至少一个环境） */
function isSigningConfigured(config) {
    const envs = getEnabledIOSEnvironments(config);
    if (envs.length === 0)
        return false;
    // 检查是否有非 simulator 的环境
    const needsRealSigning = envs.some(env => config.environments[env].exportMethod !== 'simulator');
    // 如果有真机构建环境，共享签名配置必须完整
    if (needsRealSigning && !isSharedSigningConfigured(config))
        return false;
    // 每个环境的签名配置都必须完整
    return envs.every(env => isEnvSigningConfigured(config.environments[env]));
}
exports.isSigningConfigured = isSigningConfigured;
// ==================== 签名文件管理 ====================
/**
 * 复制签名文件到 .ios-signing/ 目录
 * @returns 复制后的文件名
 */
function copySigningFile(sourcePath, projectRoot, type) {
    const signingDir = getSigningDir(projectRoot);
    fs.mkdirSync(signingDir, { recursive: true });
    const fileName = path.basename(sourcePath);
    const destPath = path.join(signingDir, fileName);
    fs.copyFileSync(sourcePath, destPath);
    return fileName;
}
exports.copySigningFile = copySigningFile;
/**
 * 解析 .mobileprovision 文件
 * 使用 security cms -D -i 解析内嵌的 plist
 */
async function parseMobileProvision(filePath) {
    try {
        // 用 security 命令解析 mobileprovision 中的 plist
        const plistXml = (0, child_process_1.execSync)(`security cms -D -i "${filePath}"`, {
            encoding: 'utf-8',
            timeout: 10000,
        });
        // 简单的 plist XML 解析（提取关键字段）
        const getName = (xml) => {
            const match = xml.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/);
            return match ? match[1] : '';
        };
        const getUUID = (xml) => {
            const match = xml.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/);
            return match ? match[1] : '';
        };
        const getTeamId = (xml) => {
            // TeamIdentifier 是一个数组
            const match = xml.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
            return match ? match[1] : '';
        };
        const getBundleId = (xml) => {
            // application-identifier 格式: TEAMID.com.xxx.xxx
            const match = xml.match(/<key>application-identifier<\/key>\s*<string>([^<]+)<\/string>/);
            if (match) {
                const fullId = match[1];
                // 去掉 Team ID 前缀
                const dotIndex = fullId.indexOf('.');
                return dotIndex >= 0 ? fullId.substring(dotIndex + 1) : fullId;
            }
            return '';
        };
        const getExpirationDate = (xml) => {
            const match = xml.match(/<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/);
            return match ? match[1] : '';
        };
        const name = getName(plistXml);
        const uuid = getUUID(plistXml);
        const teamId = getTeamId(plistXml);
        const bundleId = getBundleId(plistXml);
        const expirationDate = getExpirationDate(plistXml);
        const expired = expirationDate ? new Date(expirationDate) < new Date() : false;
        return { name, uuid, teamId, bundleId, expirationDate, expired };
    }
    catch (err) {
        throw new Error(`解析 mobileprovision 失败: ${err.message}`);
    }
}
exports.parseMobileProvision = parseMobileProvision;
/**
 * 安装 mobileprovision 到系统
 * 复制到 ~/Library/MobileDevice/Provisioning Profiles/{UUID}.mobileprovision
 */
function installMobileProvision(projectRoot, envConfig) {
    const signingDir = getSigningDir(projectRoot);
    const sourcePath = path.join(signingDir, envConfig.mobileprovisionFile);
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`未找到 mobileprovision 文件: ${sourcePath}`);
    }
    const profilesDir = path.join(process.env.HOME || '', 'Library', 'MobileDevice', 'Provisioning Profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    const destPath = path.join(profilesDir, `${envConfig.profileUUID}.mobileprovision`);
    fs.copyFileSync(sourcePath, destPath);
}
exports.installMobileProvision = installMobileProvision;
/**
 * 导入 P12 证书到钥匙串
 */
function importP12ToKeychain(projectRoot, config) {
    const signingDir = getSigningDir(projectRoot);
    const p12Path = path.join(signingDir, config.shared.p12File);
    if (!fs.existsSync(p12Path)) {
        throw new Error(`未找到 P12 证书文件: ${p12Path}`);
    }
    const password = config.shared.p12Password;
    try {
        // 导入 P12 到 login keychain
        (0, child_process_1.execSync)(`security import "${p12Path}" -k ~/Library/Keychains/login.keychain-db -P "${password}" -T /usr/bin/codesign -T /usr/bin/security 2>/dev/null || true`, { encoding: 'utf-8', timeout: 30000 });
        // 设置 partition list 避免构建时弹窗
        (0, child_process_1.execSync)(`security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" ~/Library/Keychains/login.keychain-db 2>/dev/null || true`, { encoding: 'utf-8', timeout: 30000 });
    }
    catch (err) {
        throw new Error(`导入 P12 证书失败: ${err.message}`);
    }
}
exports.importP12ToKeychain = importP12ToKeychain;
// ==================== env.json 写入 ====================
/**
 * 写入 env.json 到 data/ 目录
 * 位置: build/ios/data/env.json
 */
function writeEnvJson(buildDest, env) {
    const envJsonPath = path.join(buildDest, 'data', 'env.json');
    const content = JSON.stringify({ env }, null, 2);
    fs.writeFileSync(envJsonPath, content, 'utf-8');
}
// ==================== ExportOptions.plist 生成 ====================
/**
 * 生成 ExportOptions.plist（每个环境独立生成）
 */
function generateExportOptionsPlist(teamId, envConfig, outputPath) {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>${envConfig.exportMethod}</string>
    <key>teamID</key>
    <string>${teamId}</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>${envConfig.bundleId}</key>
        <string>${envConfig.profileName}</string>
    </dict>
    <key>compileBitcode</key>
    <false/>
    <key>stripSwiftSymbols</key>
    <true/>
</dict>
</plist>`;
    fs.writeFileSync(outputPath, plist, 'utf-8');
}
// ==================== Xcode 构建 ====================
/**
 * 在 build/ios/proj/ 下查找 Xcode 工程
 * 返回工程路径和 scheme 名称
 */
function findXcodeProject(buildDest) {
    const projDir = path.join(buildDest, 'proj');
    if (!fs.existsSync(projDir))
        return null;
    // 查找 .xcworkspace（优先）
    const entries = fs.readdirSync(projDir);
    const workspace = entries.find(e => e.endsWith('.xcworkspace'));
    const xcodeproj = entries.find(e => e.endsWith('.xcodeproj'));
    if (!workspace && !xcodeproj)
        return null;
    // 获取 scheme 名称
    let schemeName = '';
    try {
        const listCmd = workspace
            ? `xcodebuild -workspace "${path.join(projDir, workspace)}" -list`
            : `xcodebuild -project "${path.join(projDir, xcodeproj)}" -list`;
        const output = (0, child_process_1.execSync)(listCmd, { encoding: 'utf-8', timeout: 30000 });
        // 解析 scheme 名称
        const schemeMatch = output.match(/Schemes:\s*\n\s+(\S+)/);
        if (schemeMatch) {
            schemeName = schemeMatch[1];
        }
    }
    catch (_a) {
        // 回退：使用 xcodeproj 名称去掉后缀
        if (xcodeproj) {
            schemeName = xcodeproj.replace('.xcodeproj', '');
        }
    }
    if (!schemeName)
        return null;
    const result = {
        projectPath: xcodeproj ? path.join(projDir, xcodeproj) : '',
        schemeName,
    };
    if (workspace) {
        result.workspacePath = path.join(projDir, workspace);
    }
    return result;
}
exports.findXcodeProject = findXcodeProject;
/**
 * 执行 xcodebuild archive
 * 超时 15 分钟
 */
function runXcodeBuildArchive(xcodeInfo, archivePath, teamId, envConfig, onLog) {
    return new Promise((resolve, reject) => {
        const timeout = 15 * 60 * 1000; // 15 分钟
        const args = [];
        // workspace 优先
        if (xcodeInfo.workspacePath) {
            args.push('-workspace', xcodeInfo.workspacePath);
        }
        else {
            args.push('-project', xcodeInfo.projectPath);
        }
        args.push('-scheme', xcodeInfo.schemeName, '-configuration', 'Release', '-archivePath', archivePath, 'archive', `DEVELOPMENT_TEAM=${teamId}`, `PROVISIONING_PROFILE_SPECIFIER=${envConfig.profileName}`, 'CODE_SIGN_STYLE=Manual');
        onLog(`执行: xcodebuild archive -scheme ${xcodeInfo.schemeName}`, 'info');
        const child = (0, child_process_1.spawn)('xcodebuild', args, {
            env: Object.assign({}, process.env),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            reject(new Error('xcodebuild archive 超时（15分钟）'));
        }, timeout);
        // 实时输出 stdout（xcodebuild 日志量大，仅输出关键行）
        let buffer = '';
        child.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                // 过滤关键信息，减少日志噪声
                if (trimmed.startsWith('**') ||
                    trimmed.includes('error:') ||
                    trimmed.includes('warning:') ||
                    trimmed.includes('BUILD ') ||
                    trimmed.includes('ARCHIVE ') ||
                    trimmed.includes('Signing ') ||
                    trimmed.includes('CodeSign ') ||
                    trimmed.includes('Compiling') ||
                    trimmed.includes('Linking')) {
                    onLog(`[xcodebuild] ${trimmed}`, 'info');
                }
            }
        });
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                onLog(`[xcodebuild] ${line}`, 'warn');
            }
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut)
                return;
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`xcodebuild archive 退出码: ${code}`));
            }
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`xcodebuild 启动失败: ${err.message}`));
        });
    });
}
/**
 * 执行 xcodebuild -exportArchive
 * 超时 10 分钟
 */
function runXcodeBuildExport(archivePath, exportPath, exportOptionsPlistPath, onLog) {
    return new Promise((resolve, reject) => {
        const timeout = 10 * 60 * 1000; // 10 分钟
        const args = [
            '-exportArchive',
            '-archivePath', archivePath,
            '-exportPath', exportPath,
            '-exportOptionsPlist', exportOptionsPlistPath,
        ];
        onLog('执行: xcodebuild -exportArchive', 'info');
        const child = (0, child_process_1.spawn)('xcodebuild', args, {
            env: Object.assign({}, process.env),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            reject(new Error('xcodebuild export 超时（10分钟）'));
        }, timeout);
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                onLog(`[export] ${line}`, 'info');
            }
        });
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                onLog(`[export] ${line}`, 'warn');
            }
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut)
                return;
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`xcodebuild export 退出码: ${code}`));
            }
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`xcodebuild export 启动失败: ${err.message}`));
        });
    });
}
/**
 * 执行模拟器构建（无需签名）
 * 使用 xcodebuild build -sdk iphonesimulator
 * 超时 15 分钟
 */
function runXcodeBuildSimulator(xcodeInfo, onLog) {
    return new Promise((resolve, reject) => {
        const timeout = 15 * 60 * 1000; // 15 分钟
        const args = [];
        // workspace 优先
        if (xcodeInfo.workspacePath) {
            args.push('-workspace', xcodeInfo.workspacePath);
        }
        else {
            args.push('-project', xcodeInfo.projectPath);
        }
        // 不使用 -derivedDataPath，Cocos Creator 的 Xcode 工程有自定义构建目录设置
        // 子目标（CMake 生成的 libcocos_engine.a 等）路径依赖于工程默认设置
        // Cocos Creator 3.8.8 预编译的外部静态库（libv8_monolith.a、libssl.a 等）
        // 只包含 x86_64 模拟器架构，不包含 arm64-simulator
        // 因此模拟器构建只能使用 x86_64，Apple Silicon Mac 需开启 Rosetta 模式运行模拟器
        args.push('-scheme', xcodeInfo.schemeName, '-configuration', 'Release', '-sdk', 'iphonesimulator', 'build', 'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGNING_ALLOWED=NO');
        onLog(`执行: xcodebuild build -sdk iphonesimulator -scheme ${xcodeInfo.schemeName}`, 'info');
        const child = (0, child_process_1.spawn)('xcodebuild', args, {
            env: Object.assign({}, process.env),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            reject(new Error('xcodebuild build (simulator) 超时（15分钟）'));
        }, timeout);
        let buffer = '';
        child.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                if (trimmed.startsWith('**') ||
                    trimmed.includes('error:') ||
                    trimmed.includes('warning:') ||
                    trimmed.includes('BUILD ') ||
                    trimmed.includes('Compiling') ||
                    trimmed.includes('Linking')) {
                    onLog(`[xcodebuild] ${trimmed}`, 'info');
                }
            }
        });
        child.stderr.on('data', (data) => {
            const lines = data.toString().split('\n').filter(l => l.trim());
            for (const line of lines) {
                onLog(`[xcodebuild] ${line}`, 'warn');
            }
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut)
                return;
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`xcodebuild build (simulator) 退出码: ${code}`));
            }
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`xcodebuild 启动失败: ${err.message}`));
        });
    });
}
/**
 * 查找模拟器构建产出的 .app
 * Cocos Creator Xcode 工程自定义构建目录，产出在 proj/Release-iphonesimulator/*.app
 */
function findSimulatorApp(buildDest) {
    // Cocos Creator 工程的构建产出在 proj/Release-iphonesimulator/ 下
    const candidateDirs = [
        path.join(buildDest, 'proj', 'Release-iphonesimulator'),
    ];
    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir))
            continue;
        const apps = fs.readdirSync(dir).filter(f => f.endsWith('.app'));
        if (apps.length > 0) {
            return path.join(dir, apps[0]);
        }
    }
    return null;
}
/**
 * 尝试将 x86_64 .app 安装到 iOS 模拟器并启动
 * Apple Silicon Mac 上需要以 Rosetta (x86_64) 模式启动模拟器
 * 使用 xcrun simctl boot --arch=x86_64 实现
 */
function tryInstallOnSimulator(appPath, onLog) {
    try {
        // 1. 从 .app 的 Info.plist 中提取 Bundle ID（用于后续启动）
        let bundleId = '';
        try {
            const plistPath = path.join(appPath, 'Info.plist');
            bundleId = (0, child_process_1.execSync)(`/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${plistPath}"`, { encoding: 'utf8', timeout: 5000 }).trim();
        }
        catch (_a) {
            // 提取失败不影响安装
        }
        // 2. 查找支持 x86_64 Rosetta 的 iPhone 模拟器设备
        //    iOS 26+ 运行时不支持 x86_64，只有 iOS 18.x 及更早版本支持
        //    从 xcodebuild 的 destination 列表中可确认：只有 iOS 18.6 设备标记为 arch:x86_64
        const allJson = (0, child_process_1.execSync)('xcrun simctl list devices available -j', { encoding: 'utf8', timeout: 10000 });
        const allData = JSON.parse(allJson);
        // 收集所有候选设备，按运行时版本排序（优先选低版本，因为高版本可能不支持 x86_64）
        const candidates = [];
        for (const [runtime, devices] of Object.entries(allData.devices)) {
            if (!runtime.includes('iOS'))
                continue;
            // 跳过 iOS 26+ 运行时（不支持 x86_64 Rosetta）
            // 运行时格式: com.apple.CoreSimulator.SimRuntime.iOS-26-2 或 iOS-18-6
            const versionMatch = runtime.match(/iOS-(\d+)/);
            if (versionMatch && parseInt(versionMatch[1]) >= 26)
                continue;
            for (const dev of devices) {
                if (dev.name.includes('iPhone') && dev.isAvailable) {
                    candidates.push({ udid: dev.udid, name: dev.name, runtime });
                }
            }
        }
        if (candidates.length === 0) {
            onLog('未找到支持 x86_64 的 iPhone 模拟器设备（需要 iOS 18.x 运行时）', 'warn');
            onLog('请在 Xcode → Settings → Platforms 中安装 iOS 18.x 模拟器运行时', 'warn');
            return;
        }
        // 选第一个候选设备
        const target = candidates[0];
        const targetUDID = target.udid;
        const targetName = target.name;
        onLog(`选择模拟器: ${targetName} (${target.runtime.replace(/.*iOS-/, 'iOS ').replace(/-/g, '.')})`, 'info');
        // 3. 关闭该设备（如果正在运行），以便用 x86_64 模式重新启动
        try {
            (0, child_process_1.execSync)(`xcrun simctl shutdown ${targetUDID}`, { encoding: 'utf8', timeout: 10000 });
        }
        catch (_b) {
            // 设备可能本来就没启动，忽略错误
        }
        // 4. 以 x86_64 (Rosetta) 模式启动模拟器
        //    关键参数：--arch=x86_64，让模拟器运行在 Rosetta 翻译模式下
        onLog(`正在以 Rosetta (x86_64) 模式启动模拟器: ${targetName}...`, 'info');
        (0, child_process_1.execSync)(`xcrun simctl boot ${targetUDID} --arch=x86_64`, { encoding: 'utf8', timeout: 60000 });
        // 打开 Simulator 应用（显示模拟器窗口）
        (0, child_process_1.execSync)('open -a Simulator', { encoding: 'utf8', timeout: 5000 });
        onLog(`模拟器已启动 (Rosetta x86_64): ${targetName}`, 'success');
        // 5. 安装 .app 到模拟器
        onLog('正在安装应用到模拟器...', 'info');
        (0, child_process_1.execSync)(`xcrun simctl install ${targetUDID} "${appPath}"`, { encoding: 'utf8', timeout: 60000 });
        onLog('应用安装成功 ✅', 'success');
        // 6. 启动应用
        if (bundleId) {
            try {
                (0, child_process_1.execSync)(`xcrun simctl launch ${targetUDID} ${bundleId}`, { encoding: 'utf8', timeout: 10000 });
                onLog(`应用已在模拟器中启动: ${bundleId} ✅`, 'success');
            }
            catch (_c) {
                onLog('应用已安装，请在模拟器中手动打开', 'info');
            }
        }
    }
    catch (err) {
        const errMsg = (err.stderr || err.message || '').toString();
        onLog(`模拟器安装失败: ${errMsg}`, 'warn');
        onLog('可尝试手动操作: xcrun simctl boot <设备ID> --arch=x86_64', 'warn');
    }
}
/**
 * 查找导出的 IPA 文件
 */
function findBuiltIpa(exportPath) {
    if (!fs.existsSync(exportPath))
        return null;
    const files = fs.readdirSync(exportPath).filter(f => f.endsWith('.ipa'));
    return files.length > 0 ? path.join(exportPath, files[0]) : null;
}
// ==================== 核心函数 ====================
/**
 * 生成多环境 IPA
 *
 * 流程：
 * 1. 确认 Xcode 工程存在
 * 2. 安装签名文件
 * 3. 对每个环境串行执行：
 *    a. 写入 env.json
 *    b. xcodebuild archive
 *    c. xcodebuild -exportArchive
 *    d. 复制并重命名 IPA
 * 4. 写入 manifest.json
 * 5. 清理 env.json
 */
async function generateMultiEnvIpas(options) {
    const { projectRoot, version, environments, onLog } = options;
    const results = [];
    const buildDest = path.join(projectRoot, 'build', 'ios');
    // 检查 Xcode 工程
    const xcodeInfo = findXcodeProject(buildDest);
    if (!xcodeInfo) {
        onLog('未找到 Xcode 工程，请确认已通过 Cocos Creator 构建 iOS 平台', 'error');
        return results;
    }
    // 检查 xcodebuild 是否可用
    try {
        (0, child_process_1.execSync)('which xcodebuild', { encoding: 'utf-8' });
    }
    catch (_a) {
        onLog('未找到 xcodebuild，请确认已安装 Xcode 命令行工具', 'error');
        return results;
    }
    // 加载配置
    const config = loadIOSConfig(projectRoot);
    if (!config) {
        onLog('未找到 iOS 配置文件 (.iosconfig.json)，请先通过 框架/iOS/配置签名 保存配置', 'error');
        return results;
    }
    // 检查非 simulator 环境的签名配置是否完整
    const realDeviceEnvs = environments.filter(env => config.environments[env].exportMethod !== 'simulator');
    if (realDeviceEnvs.length > 0) {
        if (!isSharedSigningConfigured(config)) {
            onLog('真机构建需要 P12 证书和 Team ID，请先通过 框架/iOS/配置签名 完成配置', 'error');
            return results;
        }
        for (const env of realDeviceEnvs) {
            if (!isEnvSigningConfigured(config.environments[env])) {
                onLog(`环境 ${env} 缺少描述文件，请先通过 框架/iOS/配置签名 选择对应的 Provisioning Profile`, 'error');
                return results;
            }
        }
    }
    // 检查是否有需要真机签名的环境
    const hasRealDevice = environments.some(env => config.environments[env].exportMethod !== 'simulator');
    // 仅在有真机构建环境时导入 P12 证书
    if (hasRealDevice) {
        onLog('正在导入 P12 证书...', 'info');
        try {
            importP12ToKeychain(projectRoot, config);
            onLog('✅ P12 证书已导入钥匙串', 'success');
        }
        catch (err) {
            onLog(`导入 P12 证书失败: ${err.message}`, 'error');
            return results;
        }
    }
    // 目标输出目录
    const uploadRoot = path.join(projectRoot, 'build_upload_assets');
    const appVersionDir = path.join(uploadRoot, 'ios', 'app', version);
    fs.mkdirSync(appVersionDir, { recursive: true });
    onLog(`开始多环境 IPA 构建，共 ${environments.length} 个环境: ${environments.join(', ')}`, 'info');
    for (let i = 0; i < environments.length; i++) {
        const env = environments[i];
        const envConfig = config.environments[env];
        const isSimulator = envConfig.exportMethod === 'simulator';
        onLog(`\n========== [${i + 1}/${environments.length}] 构建环境: ${env} (${isSimulator ? '模拟器' : envConfig.exportMethod}) ==========`, 'info');
        if (isSimulator) {
            // ===== 模拟器构建路径（无需签名） =====
            try {
                // 1. 写入 env.json
                writeEnvJson(buildDest, env);
                onLog(`已写入 env.json: { "env": "${env}" }`, 'info');
                // 2. 清理之前的构建产出，避免 stale 缓存
                const simBuildDir = path.join(buildDest, 'proj', 'Release-iphonesimulator');
                if (fs.existsSync(simBuildDir)) {
                    onLog('清理旧的模拟器构建产出...', 'info');
                    fs.rmSync(simBuildDir, { recursive: true, force: true });
                }
                // 3. xcodebuild build -sdk iphonesimulator（不指定 derivedDataPath，使用工程默认设置）
                onLog('开始模拟器构建 (xcodebuild build -sdk iphonesimulator)...', 'info');
                await runXcodeBuildSimulator(xcodeInfo, onLog);
                onLog('模拟器构建完成', 'success');
                // 4. 查找 .app（Cocos 工程产出在 proj/Release-iphonesimulator/）
                const appPath = findSimulatorApp(buildDest);
                if (!appPath) {
                    throw new Error('未找到模拟器构建产出 .app');
                }
                // 5. 复制 .app 到产出目录
                const destApp = path.join(appVersionDir, `app-${env}.app`);
                // .app 是目录，递归复制
                fs.cpSync(appPath, destApp, { recursive: true });
                onLog(`已复制 .app → app-${env}.app`, 'success');
                // 6. 尝试自动安装到模拟器
                tryInstallOnSimulator(destApp, onLog);
                results.push({ env, success: true, ipaPath: destApp });
            }
            catch (err) {
                onLog(`环境 ${env} 模拟器构建失败: ${err.message}`, 'error');
                results.push({ env, success: false, error: err.message });
            }
        }
        else {
            // ===== 真机构建路径（需要签名） =====
            const archivePath = path.join(buildDest, `build-${env}.xcarchive`);
            const exportPath = path.join(buildDest, `export-${env}`);
            const exportOptionsPlistPath = path.join(buildDest, `ExportOptions-${env}.plist`);
            try {
                // 0. 安装当前环境的 Provisioning Profile
                installMobileProvision(projectRoot, envConfig);
                onLog(`已安装 ${env} 环境的 Provisioning Profile: ${envConfig.profileName}`, 'info');
                // 1. 写入 env.json
                writeEnvJson(buildDest, env);
                onLog(`已写入 env.json: { "env": "${env}" }`, 'info');
                // 2. 生成当前环境的 ExportOptions.plist
                generateExportOptionsPlist(config.shared.teamId, envConfig, exportOptionsPlistPath);
                onLog(`已生成 ExportOptions.plist (method: ${envConfig.exportMethod})`, 'info');
                // 3. xcodebuild archive
                onLog('开始 xcodebuild archive...', 'info');
                await runXcodeBuildArchive(xcodeInfo, archivePath, config.shared.teamId, envConfig, onLog);
                onLog('xcodebuild archive 完成', 'success');
                // 4. xcodebuild -exportArchive
                onLog('开始 xcodebuild -exportArchive...', 'info');
                await runXcodeBuildExport(archivePath, exportPath, exportOptionsPlistPath, onLog);
                onLog('xcodebuild -exportArchive 完成', 'success');
                // 5. 查找 IPA
                const ipaPath = findBuiltIpa(exportPath);
                if (!ipaPath) {
                    throw new Error('未找到构建产出 IPA 文件');
                }
                // 6. 复制并重命名
                const destIpa = path.join(appVersionDir, `app-${env}.ipa`);
                fs.copyFileSync(ipaPath, destIpa);
                onLog(`已复制 IPA → app-${env}.ipa`, 'success');
                results.push({ env, success: true, ipaPath: destIpa });
                // 清理临时文件
                if (fs.existsSync(archivePath)) {
                    fs.rmSync(archivePath, { recursive: true, force: true });
                }
                if (fs.existsSync(exportPath)) {
                    fs.rmSync(exportPath, { recursive: true, force: true });
                }
            }
            catch (err) {
                onLog(`环境 ${env} 构建失败: ${err.message}`, 'error');
                results.push({ env, success: false, error: err.message });
                // 清理失败的临时文件
                if (fs.existsSync(archivePath)) {
                    fs.rmSync(archivePath, { recursive: true, force: true });
                }
                if (fs.existsSync(exportPath)) {
                    fs.rmSync(exportPath, { recursive: true, force: true });
                }
            }
        }
    }
    // 写入 manifest.json
    const successEnvs = results.filter(r => r.success).map(r => r.env);
    const manifest = {
        version,
        environments: successEnvs,
        outputs: results
            .filter(r => r.success)
            .map(r => {
            const envCfg = config.environments[r.env];
            const isSimEnv = envCfg.exportMethod === 'simulator';
            return {
                env: r.env,
                filename: isSimEnv ? `app-${r.env}.app` : `app-${r.env}.ipa`,
                type: isSimEnv ? 'simulator' : envCfg.exportMethod,
            };
        }),
        buildTime: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(appVersionDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    // 清理 env.json
    const envJsonPath = path.join(buildDest, 'data', 'env.json');
    if (fs.existsSync(envJsonPath)) {
        fs.unlinkSync(envJsonPath);
        onLog('已清理 env.json', 'info');
    }
    // 清理所有环境的 ExportOptions.plist
    for (const env of environments) {
        const plistPath = path.join(buildDest, `ExportOptions-${env}.plist`);
        if (fs.existsSync(plistPath)) {
            fs.unlinkSync(plistPath);
        }
    }
    // 汇总
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    onLog(`\n========== 多环境构建完成 ==========`, 'info');
    onLog(`成功: ${successCount}, 失败: ${failCount}`, successCount === environments.length ? 'success' : 'warn');
    return results;
}
exports.generateMultiEnvIpas = generateMultiEnvIpas;
//# sourceMappingURL=ios.js.map