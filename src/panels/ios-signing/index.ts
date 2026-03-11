/**
 * iOS 签名配置面板
 * 纯签名配置：共享配置（P12 + Team ID）+ 每个环境的描述文件
 * 环境启用和导出方式在构建面板中配置
 */

// 环境列表
const ENV_LIST = [
    { key: 'dev', label: 'DEV - 开发环境' },
    { key: 'beta', label: 'BETA - 测试环境' },
    { key: 'prod', label: 'PROD - 正式环境' },
] as const;

// 面板状态
let p12File = '';
const envProfiles: Record<string, {
    mobileprovisionFile: string;
    profileName: string;
    profileUUID: string;
    bundleId: string;
}> = {
    dev: { mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' },
    beta: { mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' },
    prod: { mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' },
};

function renderEnvSection(env: typeof ENV_LIST[number]): string {
    return `
    <div style="margin-bottom: 12px; padding: 10px 12px; background: #252526; border: 1px solid #404040; border-radius: 4px;">
        <div style="color: #569cd6; font-weight: bold; font-size: 12px; margin-bottom: 8px;">${env.label}</div>

        <!-- Provisioning Profile -->
        <div style="margin-bottom: 4px;">
            <div style="color: #9cdcfe; font-size: 11px; margin-bottom: 4px;">Provisioning Profile</div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span id="env-${env.key}-mp-file" style="flex: 1; padding: 5px 8px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #888; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">未选择</span>
                <button id="btn-select-mp-${env.key}" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer; font-size: 11px; white-space: nowrap;">选择</button>
            </div>
        </div>

        <!-- Profile 解析信息 -->
        <div id="env-${env.key}-mp-info" style="display: none; padding: 6px 8px; background: #2a2a2a; border-radius: 3px; font-size: 11px; line-height: 1.6; margin-top: 4px;">
            <span style="color: #888;">Name:</span> <span id="env-${env.key}-mp-name" style="color: #4ec9b0;"></span>
            &nbsp;&nbsp;<span style="color: #888;">Bundle:</span> <span id="env-${env.key}-mp-bundleid" style="color: #c586c0;"></span>
            &nbsp;&nbsp;<span id="env-${env.key}-mp-expired" style="color: #f44747; display: none;">已过期</span>
        </div>
    </div>`;
}

export const template = `
<div id="ios-signing-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- 标题栏 -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">📱 iOS 签名配置</span>
    </div>

    <!-- 内容区 -->
    <div style="flex: 1; overflow-y: auto; padding: 16px;">

        <!-- ====== 共享配置 ====== -->
        <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #404040;">
            <div style="color: #dcdcaa; font-weight: bold; margin-bottom: 12px; font-size: 13px;">🔐 共享配置（所有真机环境通用）</div>
            <div style="color: #888; font-size: 11px; margin-bottom: 12px; line-height: 1.5;">
                如果只使用模拟器构建（在构建面板中选择 Simulator），以下配置可以留空。
            </div>

            <!-- P12 证书 -->
            <div style="margin-bottom: 12px;">
                <div style="color: #569cd6; font-weight: bold; margin-bottom: 4px; font-size: 12px;">P12 证书</div>
                <div style="color: #888; font-size: 11px; margin-bottom: 6px; line-height: 1.5;">
                    包含签名私钥的证书文件。获取方式：Mac <span style="color: #dcdcaa;">钥匙串访问</span> → 找到 iOS 发布证书 → 右键导出为 <span style="color: #4ec9b0;">.p12</span>。
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span id="p12-file" style="flex: 1; padding: 5px 8px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #888; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">未选择</span>
                    <button id="btn-select-p12" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 5px 10px; cursor: pointer; font-size: 12px; white-space: nowrap;">选择文件</button>
                </div>
            </div>

            <!-- P12 密码 -->
            <div style="margin-bottom: 12px;">
                <div style="color: #569cd6; font-weight: bold; margin-bottom: 4px; font-size: 12px;">P12 密码</div>
                <div style="color: #888; font-size: 11px; margin-bottom: 6px;">导出 .p12 时设置的密码，保存后无需重复输入。</div>
                <input id="p12-password" type="password" placeholder="输入导出 .p12 时设置的密码" style="width: 100%; box-sizing: border-box; padding: 5px 8px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #d4d4d4; font-size: 12px; outline: none;" />
            </div>

            <!-- Team ID -->
            <div>
                <div style="color: #569cd6; font-weight: bold; margin-bottom: 4px; font-size: 12px;">Team ID</div>
                <div style="color: #888; font-size: 11px; margin-bottom: 6px; line-height: 1.5;">
                    10 位字母数字。获取：<span style="color: #dcdcaa;">Apple Developer</span> → 账户 → Membership Details → Team ID。选择描述文件后可自动填充。
                </div>
                <input id="team-id" type="text" placeholder="如 A1B2C3D4E5" style="width: 100%; box-sizing: border-box; padding: 5px 8px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #d4d4d4; font-size: 12px; outline: none;" />
            </div>
        </div>

        <!-- ====== 各环境描述文件 ====== -->
        <div style="margin-bottom: 12px;">
            <div style="color: #dcdcaa; font-weight: bold; margin-bottom: 8px; font-size: 13px;">📦 环境描述文件</div>
            <div style="color: #888; font-size: 11px; margin-bottom: 12px; line-height: 1.5;">
                每个环境可配置不同的 Provisioning Profile（对应不同的导出方式）。<br/>
                获取：<span style="color: #dcdcaa;">Apple Developer</span> → Certificates, Identifiers & Profiles → Profiles → 下载 <span style="color: #4ec9b0;">.mobileprovision</span><br/>
                💡 使用模拟器构建的环境无需配置描述文件。
            </div>
            ${ENV_LIST.map(renderEnvSection).join('')}
        </div>
    </div>

    <!-- 底部栏 -->
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;">
        <span id="status-text" style="font-size: 12px; color: #888;"></span>
        <button id="btn-save" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 6px 20px; cursor: pointer; font-size: 13px;">保存配置</button>
    </div>
</div>
`;

export const style = `
#ios-signing-panel ::-webkit-scrollbar { width: 8px; }
#ios-signing-panel ::-webkit-scrollbar-track { background: #1e1e1e; }
#ios-signing-panel ::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
#ios-signing-panel ::-webkit-scrollbar-thumb:hover { background: #777; }
#ios-signing-panel input:focus, #ios-signing-panel select:focus { border-color: #0e639c !important; }
#ios-signing-panel button:hover { opacity: 0.9; }
`;

export const $ = {
    'p12-file': '#p12-file',
    'btn-select-p12': '#btn-select-p12',
    'p12-password': '#p12-password',
    'team-id': '#team-id',
    'btn-save': '#btn-save',
    'status-text': '#status-text',
    // dev 环境
    'btn-select-mp-dev': '#btn-select-mp-dev',
    'env-dev-mp-file': '#env-dev-mp-file',
    'env-dev-mp-info': '#env-dev-mp-info',
    'env-dev-mp-name': '#env-dev-mp-name',
    'env-dev-mp-bundleid': '#env-dev-mp-bundleid',
    'env-dev-mp-expired': '#env-dev-mp-expired',
    // beta 环境
    'btn-select-mp-beta': '#btn-select-mp-beta',
    'env-beta-mp-file': '#env-beta-mp-file',
    'env-beta-mp-info': '#env-beta-mp-info',
    'env-beta-mp-name': '#env-beta-mp-name',
    'env-beta-mp-bundleid': '#env-beta-mp-bundleid',
    'env-beta-mp-expired': '#env-beta-mp-expired',
    // prod 环境
    'btn-select-mp-prod': '#btn-select-mp-prod',
    'env-prod-mp-file': '#env-prod-mp-file',
    'env-prod-mp-info': '#env-prod-mp-info',
    'env-prod-mp-name': '#env-prod-mp-name',
    'env-prod-mp-bundleid': '#env-prod-mp-bundleid',
    'env-prod-mp-expired': '#env-prod-mp-expired',
};

export function ready(this: any) {
    const self = this;

    // P12 选择
    (this.$['btn-select-p12'] as HTMLElement).addEventListener('click', () => {
        Editor.Message.send('framework-plugin', 'select-ios-p12');
    });

    // 各环境的 mobileprovision 选择
    for (const env of ENV_LIST) {
        (this.$[`btn-select-mp-${env.key}`] as HTMLElement).addEventListener('click', () => {
            Editor.Message.send('framework-plugin', 'select-ios-mobileprovision', env.key);
        });
    }

    // 保存
    (this.$['btn-save'] as HTMLElement).addEventListener('click', () => {
        const teamId = (self.$['team-id'] as HTMLInputElement).value.trim();
        const p12Password = (self.$['p12-password'] as HTMLInputElement).value;

        // 签名面板只保存签名相关信息，不涉及 enabled 和 exportMethod
        // enabled 和 exportMethod 由构建面板管理
        const config: any = {
            shared: { p12File, p12Password, teamId },
            environments: {} as any,
        };

        for (const env of ENV_LIST) {
            const profile = envProfiles[env.key];
            config.environments[env.key] = {
                mobileprovisionFile: profile.mobileprovisionFile,
                profileName: profile.profileName,
                profileUUID: profile.profileUUID,
                bundleId: profile.bundleId,
            };
        }

        Editor.Message.send('framework-plugin', 'save-ios-config', JSON.stringify(config));
    });

    // 加载已有配置
    Editor.Message.send('framework-plugin', 'load-ios-signing-config');
}

function setStatusText(panel: any, text: string, color: string) {
    const el = panel.$['status-text'] as HTMLElement;
    if (el) { el.textContent = text; el.style.color = color; }
}

export function close() {
    p12File = '';
    for (const key of ['dev', 'beta', 'prod']) {
        envProfiles[key] = { mobileprovisionFile: '', profileName: '', profileUUID: '', bundleId: '' };
    }
}

export const methods = {
    /**
     * 接收某个环境的 mobileprovision 选择和解析结果
     * dataStr: { envKey, fileName, name, uuid, teamId, bundleId, expirationDate, expired }
     */
    setMobileProvisionResult(this: any, dataStr: string) {
        try {
            const data = JSON.parse(dataStr);
            const envKey = data.envKey; // 'dev' | 'beta' | 'prod'
            if (!envKey || !envProfiles[envKey]) return;

            envProfiles[envKey] = {
                mobileprovisionFile: data.fileName || '',
                profileName: data.name || '',
                profileUUID: data.uuid || '',
                bundleId: data.bundleId || '',
            };

            // 更新 UI
            const mpFileEl = this.$[`env-${envKey}-mp-file`] as HTMLElement;
            if (mpFileEl) { mpFileEl.textContent = data.fileName; mpFileEl.style.color = '#4ec9b0'; }

            const mpInfoEl = this.$[`env-${envKey}-mp-info`] as HTMLElement;
            if (mpInfoEl) mpInfoEl.style.display = 'block';

            const mpNameEl = this.$[`env-${envKey}-mp-name`] as HTMLElement;
            if (mpNameEl) mpNameEl.textContent = data.name || '';

            const mpBundleIdEl = this.$[`env-${envKey}-mp-bundleid`] as HTMLElement;
            if (mpBundleIdEl) mpBundleIdEl.textContent = data.bundleId || '';

            const mpExpiredEl = this.$[`env-${envKey}-mp-expired`] as HTMLElement;
            if (mpExpiredEl) mpExpiredEl.style.display = data.expired ? 'inline' : 'none';

            // 自动填充 Team ID（仅首次）
            if (data.teamId) {
                const teamIdInput = this.$['team-id'] as HTMLInputElement;
                if (teamIdInput && !teamIdInput.value) teamIdInput.value = data.teamId;
            }
        } catch (e) {
            console.error('[iOS签名] 解析 mobileprovision 结果失败', e);
        }
    },

    /**
     * 接收 P12 选择结果
     */
    setP12Result(this: any, dataStr: string) {
        try {
            const data = JSON.parse(dataStr);
            p12File = data.fileName || '';
            const el = this.$['p12-file'] as HTMLElement;
            if (el) { el.textContent = p12File; el.style.color = '#4ec9b0'; }
        } catch (e) {
            console.error('[iOS签名] 解析 P12 结果失败', e);
        }
    },

    /**
     * 加载已保存的配置到面板
     */
    loadConfig(this: any, configStr: string) {
        try {
            const config = JSON.parse(configStr);

            // 共享配置
            if (config.shared?.p12File) {
                p12File = config.shared.p12File;
                const el = this.$['p12-file'] as HTMLElement;
                if (el) { el.textContent = p12File; el.style.color = '#4ec9b0'; }
            }
            if (config.shared?.p12Password) {
                const el = this.$['p12-password'] as HTMLInputElement;
                if (el) el.value = config.shared.p12Password;
            }
            if (config.shared?.teamId) {
                const el = this.$['team-id'] as HTMLInputElement;
                if (el) el.value = config.shared.teamId;
            }

            // 各环境描述文件
            for (const env of ENV_LIST) {
                const envCfg = config.environments?.[env.key];
                if (!envCfg) continue;

                if (envCfg.mobileprovisionFile) {
                    envProfiles[env.key] = {
                        mobileprovisionFile: envCfg.mobileprovisionFile,
                        profileName: envCfg.profileName || '',
                        profileUUID: envCfg.profileUUID || '',
                        bundleId: envCfg.bundleId || '',
                    };

                    const mpFileEl = this.$[`env-${env.key}-mp-file`] as HTMLElement;
                    if (mpFileEl) { mpFileEl.textContent = envCfg.mobileprovisionFile; mpFileEl.style.color = '#4ec9b0'; }

                    if (envCfg.profileName) {
                        const mpInfoEl = this.$[`env-${env.key}-mp-info`] as HTMLElement;
                        if (mpInfoEl) mpInfoEl.style.display = 'block';

                        const mpNameEl = this.$[`env-${env.key}-mp-name`] as HTMLElement;
                        if (mpNameEl) mpNameEl.textContent = envCfg.profileName;

                        const mpBundleIdEl = this.$[`env-${env.key}-mp-bundleid`] as HTMLElement;
                        if (mpBundleIdEl) mpBundleIdEl.textContent = envCfg.bundleId || '';
                    }
                }
            }
        } catch (e) {
            console.error('[iOS签名] 加载配置失败', e);
        }
    },

    /**
     * 设置状态信息
     */
    setStatus(this: any, dataStr: string) {
        try {
            const data = JSON.parse(dataStr);
            setStatusText(this, data.text || '', data.color || '#888');
        } catch {}
    },
};
