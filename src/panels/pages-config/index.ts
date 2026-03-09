/**
 * Pages 配置面板
 *
 * API Token + 三环境项目名/域名配置
 */

let inputApiToken: HTMLInputElement | null = null;
let inputs: Record<string, { projectName: HTMLInputElement; domain: HTMLInputElement }> = {} as any;
let statusEl: HTMLElement | null = null;
let btnSaveEl: HTMLElement | null = null;
let connectionVerified = false;

const envLabels = [
    { key: 'production', label: '正式环境' },
    { key: 'staging', label: '预览环境' },
    { key: 'dev', label: '开发环境' },
];

function envFieldsHtml(key: string, label: string): string {
    return `
        <div style="margin-bottom: 12px;">
            <div style="color: #569cd6; font-size: 12px; font-weight: bold; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #404040;">─── ${label} ───</div>
            <div style="margin-bottom: 8px;">
                <label style="display: block; margin-bottom: 3px; color: #9cdcfe; font-size: 11px;">项目名</label>
                <input id="input-${key}-project" type="text" placeholder="如 my-game${key === 'staging' ? '-staging' : key === 'dev' ? '-dev' : ''}" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; font-size: 13px; outline: none;">
            </div>
            <div style="margin-bottom: 4px;">
                <label style="display: block; margin-bottom: 3px; color: #9cdcfe; font-size: 11px;">域名（可选）</label>
                <input id="input-${key}-domain" type="text" placeholder="如 ${key === 'production' ? 'game.com' : key + '.game.com'}" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 10px; font-size: 13px; outline: none;">
            </div>
        </div>
    `;
}

export const template = `
<div id="pages-config-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">📄 配置 Cloudflare Pages</span>
    </div>

    <!-- Form -->
    <div style="flex: 1; overflow-y: auto; padding: 16px;">
        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;">API Token</label>
            <input id="input-api-token" type="password" placeholder="输入 Cloudflare API Token" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;">
            <div id="token-help" style="margin-top: 4px; font-size: 11px; color: #569cd6; cursor: pointer; text-decoration: underline;">ℹ️ 如何获取 API Token？</div>
        </div>

        ${envLabels.map(e => envFieldsHtml(e.key, e.label)).join('')}

        <div id="status-text" style="min-height: 20px; font-size: 12px; color: #888; padding: 4px 0;"></div>
    </div>

    <!-- Buttons -->
    <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;">
        <button id="btn-test" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px;">测试连接</button>
        <button id="btn-save" style="background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 6px 16px; cursor: pointer; font-size: 12px;">保存</button>
    </div>
</div>
`;

export const style = `
#pages-config-panel input:focus {
    border-color: #0e639c !important;
}
#pages-config-panel button:hover:not(:disabled) {
    opacity: 0.9;
}
`;

export const $ = {
    'input-api-token': '#input-api-token',
    'token-help': '#token-help',
    'input-production-project': '#input-production-project',
    'input-production-domain': '#input-production-domain',
    'input-staging-project': '#input-staging-project',
    'input-staging-domain': '#input-staging-domain',
    'input-dev-project': '#input-dev-project',
    'input-dev-domain': '#input-dev-domain',
    'btn-test': '#btn-test',
    'btn-save': '#btn-save',
    'status-text': '#status-text',
};

function setStatus(text: string, color: string) {
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    }
}

export function ready(this: any) {
    inputApiToken = this.$['input-api-token'] as HTMLInputElement;
    statusEl = this.$['status-text'] as HTMLElement;
    btnSaveEl = this.$['btn-save'] as HTMLElement;

    inputs = {};
    for (const e of envLabels) {
        inputs[e.key] = {
            projectName: this.$[`input-${e.key}-project`] as HTMLInputElement,
            domain: this.$[`input-${e.key}-domain`] as HTMLInputElement,
        };
    }

    // 帮助链接
    const tokenHelp = this.$['token-help'] as HTMLElement;
    tokenHelp.addEventListener('click', () => {
        Editor.Dialog.info(
            '如何获取 API Token\n\n'
            + '1. 打开 https://dash.cloudflare.com/profile/api-tokens\n'
            + '2. 点击 Create Token\n'
            + '3. 选择 Create Custom Token → Get started\n'
            + '4. 权限设置：Account → Cloudflare Pages → Edit\n'
            + '5. 点击 Continue to summary → Create Token\n'
            + '6. 复制 Token 粘贴到此处\n\n'
            + '⚠️ Token 只会显示一次，请妥善保存。',
            { title: 'API Token 获取指南', buttons: ['知道了'] }
        );
    });

    // 测试连接
    const btnTest = this.$['btn-test'] as HTMLElement;
    btnTest.addEventListener('click', () => {
        setStatus('正在测试连接...', '#569cd6');
        const config = getFormValues();
        Editor.Message.send('framework-plugin', 'test-pages-connection', JSON.stringify(config));
    });

    // 保存
    btnSaveEl.addEventListener('click', () => {
        const config = getFormValues();
        if (!config.pagesApiToken) {
            setStatus('⚠️ 请填写 API Token', '#ce9178');
            return;
        }
        Editor.Message.send('framework-plugin', 'save-pages-config', JSON.stringify(config));
    });
}

export function close() {
    inputApiToken = null;
    inputs = {} as any;
    statusEl = null;
    btnSaveEl = null;
    connectionVerified = false;
}

function getFormValues() {
    const pagesProjects: any = {};
    for (const e of envLabels) {
        pagesProjects[e.key] = {
            projectName: inputs[e.key]?.projectName?.value?.trim() || '',
            domain: inputs[e.key]?.domain?.value?.trim() || '',
        };
    }
    return {
        pagesApiToken: inputApiToken?.value?.trim() || '',
        pagesProjects,
    };
}

export const methods = {
    loadConfig(configStr: string) {
        try {
            const config = JSON.parse(configStr);
            if (inputApiToken) inputApiToken.value = config.pagesApiToken || '';
            for (const e of envLabels) {
                const proj = config.pagesProjects?.[e.key];
                if (inputs[e.key]) {
                    inputs[e.key].projectName.value = proj?.projectName || '';
                    inputs[e.key].domain.value = proj?.domain || '';
                }
            }
        } catch (e) {
            console.error('[Pages Config] 加载配置失败', e);
        }
    },

    setStatus(dataStr: string) {
        try {
            const { text, color } = JSON.parse(dataStr);
            setStatus(text, color);
        } catch (e) {
            console.error('[Pages Config] 状态设置失败', e);
        }
    },
};
