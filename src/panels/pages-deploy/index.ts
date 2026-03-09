/**
 * Pages 部署面板
 *
 * 步骤一：选择版本 + 环境
 * 步骤二：输入部署说明（必填，多行）
 * 点击部署时弹出确认框
 */

let currentStep = 1;
let envData: Array<{ env: string; label: string; projectName: string; configured: boolean }> = [];
let versions: string[] = [];

export const template = `
<div id="pages-deploy-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span id="header-title" style="font-weight: bold; color: #569cd6; font-size: 14px;">🚀 部署到 Pages</span>
    </div>

    <!-- Step 1: Select version + env -->
    <div id="step1" style="flex: 1; overflow-y: auto; padding: 16px;">
        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 6px; color: #9cdcfe; font-size: 12px; font-weight: bold;">选择版本（R2）</label>
            <div id="version-list" style="max-height: 200px; overflow-y: auto; border: 1px solid #404040; border-radius: 4px; background: #2d2d2d;"></div>
        </div>
        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 6px; color: #9cdcfe; font-size: 12px; font-weight: bold;">部署目标</label>
            <div id="env-list"></div>
        </div>
        <div id="step1-status" style="font-size: 12px; color: #888; min-height: 20px;"></div>
    </div>

    <!-- Step 2: Commit message -->
    <div id="step2" style="flex: 1; overflow-y: auto; padding: 16px; display: none;">
        <div id="deploy-summary" style="margin-bottom: 12px; padding: 10px; background: #2d2d2d; border-radius: 4px; font-size: 12px; border: 1px solid #404040;"></div>
        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px; font-weight: bold;">部署说明（必填）</label>
            <textarea id="input-commit-msg" rows="5" placeholder="请输入部署说明，支持多行&#10;如：&#10;修复登录 Bug&#10;优化加载速度" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none; resize: vertical; font-family: inherit;"></textarea>
        </div>
        <div id="step2-status" style="font-size: 12px; color: #888; min-height: 20px;"></div>
    </div>

    <!-- Deploying status -->
    <div id="deploying" style="flex: 1; overflow-y: auto; padding: 16px; display: none;">
        <div style="text-align: center; padding: 40px 0;">
            <div style="font-size: 24px; margin-bottom: 12px;">⏳</div>
            <div style="color: #569cd6; font-size: 14px;">正在部署...</div>
            <div id="deploy-log" style="margin-top: 16px; text-align: left; font-size: 11px; color: #888; max-height: 200px; overflow-y: auto;"></div>
        </div>
    </div>

    <!-- Buttons -->
    <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;">
        <button id="btn-back" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px; display: none;">上一步</button>
        <button id="btn-next" style="background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; cursor: pointer; font-size: 12px;">下一步</button>
    </div>
</div>
`;

export const style = `
#pages-deploy-panel textarea:focus, #pages-deploy-panel input:focus {
    border-color: #0e639c !important;
}
#pages-deploy-panel button:hover:not(:disabled) {
    opacity: 0.9;
}
.version-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #333; }
.version-item:hover { background: #383838; }
.version-item.selected { background: #0e639c33; border-left: 3px solid #0e639c; }
.env-item { padding: 6px 10px; margin-bottom: 4px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.env-item:hover:not(.disabled) { background: #383838; }
.env-item.selected { background: #0e639c33; }
.env-item.disabled { opacity: 0.4; cursor: not-allowed; }
`;

export const $ = {
    'header-title': '#header-title',
    'step1': '#step1',
    'step2': '#step2',
    'deploying': '#deploying',
    'version-list': '#version-list',
    'env-list': '#env-list',
    'input-commit-msg': '#input-commit-msg',
    'deploy-summary': '#deploy-summary',
    'deploy-log': '#deploy-log',
    'step1-status': '#step1-status',
    'step2-status': '#step2-status',
    'btn-back': '#btn-back',
    'btn-next': '#btn-next',
};

let selectedVersion = '';
let selectedEnv = '';
let selectedEnvLabel = '';
let panelRef: any = null;

function getSelectedVersion(): string {
    const el = panelRef?.$['version-list']?.querySelector('.version-item.selected');
    return el?.getAttribute('data-version') || '';
}

function getSelectedEnv(): string {
    const el = panelRef?.$['env-list']?.querySelector('.env-item.selected');
    return el?.getAttribute('data-env') || '';
}

function showStep(step: number) {
    currentStep = step;
    const step1 = panelRef.$['step1'] as HTMLElement;
    const step2 = panelRef.$['step2'] as HTMLElement;
    const deploying = panelRef.$['deploying'] as HTMLElement;
    const btnBack = panelRef.$['btn-back'] as HTMLElement;
    const btnNext = panelRef.$['btn-next'] as HTMLElement;

    step1.style.display = step === 1 ? '' : 'none';
    step2.style.display = step === 2 ? '' : 'none';
    deploying.style.display = step === 3 ? '' : 'none';
    btnBack.style.display = step === 2 ? '' : 'none';
    btnNext.style.display = step <= 2 ? '' : 'none';
    btnNext.textContent = step === 1 ? '下一步' : '🚀 部署';
}

export function ready(this: any) {
    panelRef = this;
    currentStep = 1;

    const btnNext = this.$['btn-next'] as HTMLElement;
    const btnBack = this.$['btn-back'] as HTMLElement;

    btnNext.addEventListener('click', () => {
        if (currentStep === 1) {
            selectedVersion = getSelectedVersion();
            selectedEnv = getSelectedEnv();
            if (!selectedVersion) {
                (panelRef.$['step1-status'] as HTMLElement).textContent = '⚠️ 请选择一个版本';
                (panelRef.$['step1-status'] as HTMLElement).style.color = '#ce9178';
                return;
            }
            if (!selectedEnv) {
                (panelRef.$['step1-status'] as HTMLElement).textContent = '⚠️ 请选择部署目标';
                (panelRef.$['step1-status'] as HTMLElement).style.color = '#ce9178';
                return;
            }
            selectedEnvLabel = envData.find(e => e.env === selectedEnv)?.label || selectedEnv;
            const summary = panelRef.$['deploy-summary'] as HTMLElement;
            summary.innerHTML = `<div>版本: <span style="color: #4ec9b0;">${selectedVersion}</span></div><div>目标: <span style="color: #dcdcaa;">${selectedEnvLabel}</span></div>`;
            showStep(2);
        } else if (currentStep === 2) {
            const msgInput = panelRef.$['input-commit-msg'] as HTMLTextAreaElement;
            const msg = msgInput?.value?.trim();
            if (!msg) {
                (panelRef.$['step2-status'] as HTMLElement).textContent = '⚠️ 请输入部署说明';
                (panelRef.$['step2-status'] as HTMLElement).style.color = '#ce9178';
                return;
            }
            // 确认弹窗
            Editor.Dialog.warn(
                `确认部署\n\n版本: ${selectedVersion}\n目标: ${selectedEnvLabel}\n\n说明:\n${msg}\n\n确认部署到【${selectedEnvLabel}】？`,
                { buttons: ['确认部署', '取消'], default: 0, cancel: 1, title: '⚠️ 部署确认' }
            ).then((result: any) => {
                if (result.response === 0) {
                    showStep(3);
                    Editor.Message.send('framework-plugin', 'do-deploy-to-pages', JSON.stringify({
                        version: selectedVersion,
                        env: selectedEnv,
                        commitMessage: msg,
                    }));
                }
            });
        }
    });

    btnBack.addEventListener('click', () => {
        if (currentStep === 2) showStep(1);
    });
}

export function close() {
    panelRef = null;
    currentStep = 1;
    envData = [];
    versions = [];
}

export const methods = {
    /** 设置版本列表和环境数据 */
    setDeployData(dataStr: string) {
        try {
            const data = JSON.parse(dataStr);
            versions = data.versions || [];
            envData = data.environments || [];

            // 渲染版本列表
            const versionList = panelRef?.$['version-list'] as HTMLElement;
            if (versionList) {
                if (versions.length === 0) {
                    versionList.innerHTML = '<div style="padding: 12px; text-align: center; color: #666;">未找到版本</div>';
                } else {
                    versionList.innerHTML = versions.map((v: string) =>
                        `<div class="version-item" data-version="${v}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #333;">📦 ${v}</div>`
                    ).join('');
                    versionList.querySelectorAll('.version-item').forEach(el => {
                        el.addEventListener('click', () => {
                            versionList.querySelectorAll('.version-item').forEach(e => e.classList.remove('selected'));
                            el.classList.add('selected');
                        });
                    });
                }
            }

            // 渲染环境列表
            const envList = panelRef?.$['env-list'] as HTMLElement;
            if (envList) {
                envList.innerHTML = envData.map((e: any) => {
                    const disabled = !e.configured;
                    return `<div class="env-item${disabled ? ' disabled' : ''}" data-env="${e.env}" style="padding: 6px 10px; margin-bottom: 4px; border-radius: 4px; cursor: ${disabled ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 8px; ${disabled ? 'opacity: 0.4;' : ''}">
                        <span style="font-size: 14px;">${disabled ? '×' : '○'}</span>
                        <span>${e.label}</span>
                        <span style="color: #888; font-size: 11px;">${e.configured ? e.projectName : '待配置'}</span>
                    </div>`;
                }).join('');
                envList.querySelectorAll('.env-item:not(.disabled)').forEach(el => {
                    el.addEventListener('click', () => {
                        envList.querySelectorAll('.env-item').forEach(e => e.classList.remove('selected'));
                        el.classList.add('selected');
                        (el.querySelector('span') as HTMLElement).textContent = '●';
                        // Reset non-selected
                        envList.querySelectorAll('.env-item:not(.selected):not(.disabled)').forEach(e => {
                            (e.querySelector('span') as HTMLElement).textContent = '○';
                        });
                    });
                });
            }
        } catch (e) {
            console.error('[Pages Deploy] 数据设置失败', e);
        }
    },

    /** 追加部署日志 */
    appendDeployLog(logStr: string) {
        const logEl = panelRef?.$['deploy-log'] as HTMLElement;
        if (logEl) {
            const line = document.createElement('div');
            line.textContent = logStr;
            line.style.marginBottom = '2px';
            logEl.appendChild(line);
            logEl.scrollTop = logEl.scrollHeight;
        }
    },

    /** 部署完成 */
    setDeployComplete(resultStr: string) {
        try {
            const result = JSON.parse(resultStr);
            const deploying = panelRef?.$['deploying'] as HTMLElement;
            if (deploying) {
                const icon = result.success ? '✅' : '❌';
                const msg = result.success ? `部署成功！${result.url ? '\n' + result.url : ''}` : `部署失败: ${result.error}`;
                const color = result.success ? '#4ec9b0' : '#f44747';
                deploying.querySelector('div > div:first-child')!.textContent = icon;
                const textEl = deploying.querySelector('div > div:nth-child(2)') as HTMLElement;
                textEl.textContent = msg;
                textEl.style.color = color;
                textEl.style.whiteSpace = 'pre-wrap';
            }
        } catch (e) {
            console.error('[Pages Deploy] 结果设置失败', e);
        }
    },
};
