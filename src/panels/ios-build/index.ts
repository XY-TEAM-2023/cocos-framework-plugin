/**
 * iOS 多环境构建面板
 * 环境勾选 + 导出方式选择 + 构建按钮 + 实时日志输出
 */

// 面板状态
const logLines: Array<{ time: string; type: string; message: string }> = [];
let logContainer: HTMLElement | null = null;
let isBuilding = false;
let envValues: Record<string, { enabled: boolean; method: string }> = {
    dev: { enabled: true, method: 'simulator' },
    beta: { enabled: false, method: 'ad-hoc' },
    prod: { enabled: false, method: 'app-store' },
};

function renderEnvRow(key: string, label: string, defaultMethod: string, defaultChecked: boolean): string {
    const methodOptions = [
        { value: 'simulator', label: '模拟器' },
        { value: 'development', label: 'Development' },
        { value: 'ad-hoc', label: 'Ad Hoc' },
        { value: 'app-store', label: 'App Store' },
        { value: 'enterprise', label: 'Enterprise' },
    ];
    const optionsHtml = methodOptions.map(o =>
        `<option value="${o.value}"${o.value === defaultMethod ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    return `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <input id="env-${key}" type="checkbox" ${defaultChecked ? 'checked' : ''} />
        <span style="width: 100px; font-size: 12px;">${label}</span>
        <select id="env-${key}-method" style="flex: 1; padding: 4px 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #d4d4d4; font-size: 11px; outline: none;">
            ${optionsHtml}
        </select>
        <span id="env-${key}-hint" style="font-size: 11px; color: #666; min-width: 80px; text-align: right;">${defaultMethod === 'simulator' ? '无需签名 (x86_64)' : ''}</span>
    </div>`;
}

export const template = `
<div id="ios-build-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- 标题栏 -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">📱 iOS 多环境构建</span>
    </div>

    <!-- 配置区 -->
    <div style="padding: 16px; border-bottom: 1px solid #404040;">
        <!-- 签名状态 -->
        <div style="margin-bottom: 12px;">
            <span style="color: #888; font-size: 12px;">签名状态: </span>
            <span id="signing-status" style="font-size: 12px; color: #888;">检查中...</span>
        </div>

        <!-- 环境 + 导出方式 -->
        <div style="margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="width: 100px;">&nbsp;</span>
                <span style="color: #569cd6; font-weight: bold; font-size: 11px; flex: 1;">导出方式</span>
            </div>
            ${renderEnvRow('dev', 'dev - 开发', 'simulator', true)}
            ${renderEnvRow('beta', 'beta - 测试', 'ad-hoc', false)}
            ${renderEnvRow('prod', 'prod - 正式', 'app-store', false)}
        </div>

        <!-- 模拟器提示 -->
        <div style="margin-bottom: 10px; padding: 6px 10px; background: #2a2a2a; border-radius: 3px; border-left: 3px solid #569cd6;">
            <span style="font-size: 11px; color: #888;">💡 模拟器构建为 x86_64 架构。Apple Silicon Mac 需在 Xcode 中对模拟器启用 Rosetta（Product → Destination → 勾选 "Show Rosetta Destinations"）</span>
        </div>

        <!-- 构建按钮 -->
        <button id="btn-build" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 8px 24px; cursor: pointer; font-size: 13px; font-weight: bold;">开始构建</button>
    </div>

    <!-- 日志区标题 -->
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-size: 12px; color: #569cd6; font-weight: bold;">📋 构建日志</span>
        <div style="display: flex; gap: 8px;">
            <button id="btn-clear" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;">清空</button>
            <button id="btn-copy" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;">复制</button>
        </div>
    </div>

    <!-- 日志容器 -->
    <div id="log-container" style="flex: 1; overflow-y: auto; padding: 8px 12px; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6;"></div>
</div>
`;

export const style = `
#ios-build-panel ::-webkit-scrollbar { width: 8px; }
#ios-build-panel ::-webkit-scrollbar-track { background: #1e1e1e; }
#ios-build-panel ::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
#ios-build-panel ::-webkit-scrollbar-thumb:hover { background: #777; }
#ios-build-panel button:hover { opacity: 0.9; }
#ios-build-panel select:focus { border-color: #0e639c !important; }
`;

export const $ = {
    'signing-status': '#signing-status',
    'env-dev': '#env-dev',
    'env-dev-method': '#env-dev-method',
    'env-dev-hint': '#env-dev-hint',
    'env-beta': '#env-beta',
    'env-beta-method': '#env-beta-method',
    'env-beta-hint': '#env-beta-hint',
    'env-prod': '#env-prod',
    'env-prod-method': '#env-prod-method',
    'env-prod-hint': '#env-prod-hint',
    'btn-build': '#btn-build',
    'btn-copy': '#btn-copy',
    'btn-clear': '#btn-clear',
    'log-container': '#log-container',
};

function getColorForType(type: string): string {
    switch (type) {
        case 'success': return '#4ec9b0';
        case 'warn': return '#ce9178';
        case 'error': return '#f44747';
        default: return '#d4d4d4';
    }
}

function getPrefixForType(type: string): string {
    switch (type) {
        case 'success': return '✅';
        case 'warn': return '⚠️';
        case 'error': return '❌';
        default: return 'ℹ️';
    }
}

function renderLog(entry: { time: string; type: string; message: string }): string {
    const color = getColorForType(entry.type);
    const prefix = getPrefixForType(entry.type);
    const timeColor = '#6a9955';
    return `<div style="padding: 1px 0; border-bottom: 1px solid #2a2a2a;">
        <span style="color: ${timeColor};">[${entry.time}]</span>
        <span style="color: ${color};"> ${prefix} ${entry.message}</span>
    </div>`;
}

/** 更新导出方式提示（simulator → 无需签名） */
function updateMethodHint(panel: any, envKey: string) {
    const methodEl = panel.$[`env-${envKey}-method`] as HTMLSelectElement;
    const hintEl = panel.$[`env-${envKey}-hint`] as HTMLElement;
    if (methodEl && hintEl) {
        hintEl.textContent = methodEl.value === 'simulator' ? '无需签名 (x86_64)' : '';
    }
}

export function ready(this: any) {
    const self = this;
    logContainer = this.$['log-container'] as HTMLElement;
    const btnBuild = this.$['btn-build'] as HTMLButtonElement;
    const btnCopy = this.$['btn-copy'] as HTMLElement;
    const btnClear = this.$['btn-clear'] as HTMLElement;

    // 环境勾选 + 导出方式变化
    for (const envKey of ['dev', 'beta', 'prod']) {
        const checkbox = this.$[`env-${envKey}`] as HTMLInputElement;
        const methodEl = this.$[`env-${envKey}-method`] as HTMLSelectElement;

        checkbox.addEventListener('change', () => {
            envValues[envKey].enabled = checkbox.checked;
        });

        methodEl.addEventListener('change', () => {
            envValues[envKey].method = methodEl.value;
            updateMethodHint(self, envKey);
        });
    }

    // 开始构建
    btnBuild.addEventListener('click', () => {
        if (isBuilding) return;

        // 收集启用的环境及其导出方式
        const envs: Array<{ env: string; exportMethod: string }> = [];
        for (const envKey of ['dev', 'beta', 'prod']) {
            if (envValues[envKey].enabled) {
                envs.push({ env: envKey, exportMethod: envValues[envKey].method });
            }
        }

        if (envs.length === 0) {
            appendLocalLog('请至少勾选一个构建环境', 'error');
            return;
        }

        // 清空旧日志
        logLines.length = 0;
        if (logContainer) logContainer.innerHTML = '';

        // 发送构建请求，包含环境和导出方式
        Editor.Message.send('framework-plugin', 'start-ios-build', JSON.stringify({
            environments: envs.map(e => e.env),
            exportMethods: envs.reduce((acc: any, e) => { acc[e.env] = e.exportMethod; return acc; }, {}),
        }));
    });

    // 复制按钮
    btnCopy.addEventListener('click', () => {
        const text = logLines.map(e => `[${e.time}] ${getPrefixForType(e.type)} ${e.message}`).join('\n');
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                btnCopy.textContent = '已复制 ✅';
                setTimeout(() => { btnCopy.textContent = '复制'; }, 1500);
            });
        }
    });

    // 清空按钮
    btnClear.addEventListener('click', () => {
        logLines.length = 0;
        if (logContainer) logContainer.innerHTML = '';
    });

    // 加载配置
    Editor.Message.send('framework-plugin', 'load-ios-build-config');
}

function appendLocalLog(message: string, type: string) {
    const entry = { time: new Date().toLocaleTimeString(), type, message };
    logLines.push(entry);
    if (logContainer) {
        const div = document.createElement('div');
        div.innerHTML = renderLog(entry);
        logContainer.appendChild(div.firstElementChild as HTMLElement);
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

export function close() {
    logContainer = null;
    isBuilding = false;
}

export const methods = {
    /**
     * 加载配置到面板（签名状态、环境选择、导出方式）
     */
    loadConfig(this: any, dataStr: string) {
        try {
            const data = JSON.parse(dataStr);

            // 签名状态
            const statusEl = this.$['signing-status'] as HTMLElement;
            const btnBuild = this.$['btn-build'] as HTMLButtonElement;

            if (data.signingReady) {
                statusEl.textContent = '✅ 签名已配置';
                statusEl.style.color = '#4ec9b0';
            } else if (data.hasSharedConfig) {
                statusEl.textContent = '⚠️ 部分环境缺少描述文件';
                statusEl.style.color = '#ce9178';
            } else {
                statusEl.textContent = '💡 仅模拟器可用，真机构建需先配置签名';
                statusEl.style.color = '#888';
            }
            // 始终允许构建（simulator 不需要签名）
            btnBuild.disabled = false;
            btnBuild.style.opacity = '1';

            // 环境启用 + 导出方式
            if (data.environments) {
                for (const envKey of ['dev', 'beta', 'prod']) {
                    const envCfg = data.environments[envKey];
                    if (!envCfg) continue;

                    const checkbox = this.$[`env-${envKey}`] as HTMLInputElement;
                    const methodEl = this.$[`env-${envKey}-method`] as HTMLSelectElement;

                    if (checkbox) {
                        checkbox.checked = envCfg.enabled !== false;
                        envValues[envKey].enabled = checkbox.checked;
                    }
                    if (methodEl && envCfg.exportMethod) {
                        methodEl.value = envCfg.exportMethod;
                        envValues[envKey].method = envCfg.exportMethod;
                    }

                    updateMethodHint(this, envKey);
                }
            }
        } catch (e) {
            console.error('[iOS构建] 加载配置失败', e);
        }
    },

    /**
     * 追加构建日志
     */
    appendLog(this: any, dataStr: string) {
        try {
            const entry = JSON.parse(dataStr);
            logLines.push(entry);
            if (logLines.length > 500) {
                logLines.splice(0, logLines.length - 500);
            }
            if (logContainer) {
                const div = document.createElement('div');
                div.innerHTML = renderLog(entry);
                logContainer.appendChild(div.firstElementChild as HTMLElement);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        } catch (e) {
            console.error('[iOS构建] 日志解析失败', e);
        }
    },

    /**
     * 构建开始，禁用按钮
     */
    setBuildStarted(this: any) {
        isBuilding = true;
        const btnBuild = this.$['btn-build'] as HTMLButtonElement;
        if (btnBuild) {
            btnBuild.textContent = '构建中...';
            btnBuild.disabled = true;
            btnBuild.style.opacity = '0.5';
        }
    },

    /**
     * 构建完成，恢复按钮
     */
    setBuildComplete(this: any, dataStr: string) {
        isBuilding = false;
        const btnBuild = this.$['btn-build'] as HTMLButtonElement;
        if (btnBuild) {
            btnBuild.textContent = '开始构建';
            btnBuild.disabled = false;
            btnBuild.style.opacity = '1';
        }
    },
};
