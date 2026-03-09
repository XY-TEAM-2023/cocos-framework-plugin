"use strict";
/**
 * Pages 配置面板
 *
 * API Token + 三环境项目名/域名配置
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
let inputApiToken = null;
let inputs = {};
let statusEl = null;
let btnSaveEl = null;
let connectionVerified = false;
const envLabels = [
    { key: 'production', label: '正式环境' },
    { key: 'staging', label: '预览环境' },
    { key: 'dev', label: '开发环境' },
];
function envFieldsHtml(key, label) {
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
exports.template = `
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
exports.style = `
#pages-config-panel input:focus {
    border-color: #0e639c !important;
}
#pages-config-panel button:hover:not(:disabled) {
    opacity: 0.9;
}
`;
exports.$ = {
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
function setStatus(text, color) {
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    }
}
function ready() {
    inputApiToken = this.$['input-api-token'];
    statusEl = this.$['status-text'];
    btnSaveEl = this.$['btn-save'];
    inputs = {};
    for (const e of envLabels) {
        inputs[e.key] = {
            projectName: this.$[`input-${e.key}-project`],
            domain: this.$[`input-${e.key}-domain`],
        };
    }
    // 帮助链接
    const tokenHelp = this.$['token-help'];
    tokenHelp.addEventListener('click', () => {
        Editor.Dialog.info('如何获取 API Token\n\n'
            + '1. 打开 https://dash.cloudflare.com/profile/api-tokens\n'
            + '2. 点击 Create Token\n'
            + '3. 选择 Create Custom Token → Get started\n'
            + '4. 权限设置：Account → Cloudflare Pages → Edit\n'
            + '5. 点击 Continue to summary → Create Token\n'
            + '6. 复制 Token 粘贴到此处\n\n'
            + '⚠️ Token 只会显示一次，请妥善保存。', { title: 'API Token 获取指南', buttons: ['知道了'] });
    });
    // 测试连接
    const btnTest = this.$['btn-test'];
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
exports.ready = ready;
function close() {
    inputApiToken = null;
    inputs = {};
    statusEl = null;
    btnSaveEl = null;
    connectionVerified = false;
}
exports.close = close;
function getFormValues() {
    var _a, _b, _c, _d, _e, _f, _g;
    const pagesProjects = {};
    for (const e of envLabels) {
        pagesProjects[e.key] = {
            projectName: ((_c = (_b = (_a = inputs[e.key]) === null || _a === void 0 ? void 0 : _a.projectName) === null || _b === void 0 ? void 0 : _b.value) === null || _c === void 0 ? void 0 : _c.trim()) || '',
            domain: ((_f = (_e = (_d = inputs[e.key]) === null || _d === void 0 ? void 0 : _d.domain) === null || _e === void 0 ? void 0 : _e.value) === null || _f === void 0 ? void 0 : _f.trim()) || '',
        };
    }
    return {
        pagesApiToken: ((_g = inputApiToken === null || inputApiToken === void 0 ? void 0 : inputApiToken.value) === null || _g === void 0 ? void 0 : _g.trim()) || '',
        pagesProjects,
    };
}
exports.methods = {
    loadConfig(configStr) {
        var _a;
        try {
            const config = JSON.parse(configStr);
            if (inputApiToken)
                inputApiToken.value = config.pagesApiToken || '';
            for (const e of envLabels) {
                const proj = (_a = config.pagesProjects) === null || _a === void 0 ? void 0 : _a[e.key];
                if (inputs[e.key]) {
                    inputs[e.key].projectName.value = (proj === null || proj === void 0 ? void 0 : proj.projectName) || '';
                    inputs[e.key].domain.value = (proj === null || proj === void 0 ? void 0 : proj.domain) || '';
                }
            }
        }
        catch (e) {
            console.error('[Pages Config] 加载配置失败', e);
        }
    },
    setStatus(dataStr) {
        try {
            const { text, color } = JSON.parse(dataStr);
            setStatus(text, color);
        }
        catch (e) {
            console.error('[Pages Config] 状态设置失败', e);
        }
    },
};
//# sourceMappingURL=index.js.map