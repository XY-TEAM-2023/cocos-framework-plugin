"use strict";
/**
 * Pages 配置面板
 *
 * API Token + Tab 切换三环境配置
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
let inputApiToken = null;
let statusEl = null;
let activeTab = 'production';
let panelRef = null;
const envTabs = [
    { key: 'production', label: '正式' },
    { key: 'staging', label: '预览' },
    { key: 'dev', label: '开发' },
];
exports.template = `
<div id="pages-config-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">📄 配置 Cloudflare Pages</span>
    </div>

    <!-- Form -->
    <div style="flex: 1; overflow-y: auto; padding: 16px;">
        <!-- API Token -->
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 6px; color: #9cdcfe; font-size: 12px;">API Token</label>
            <input id="input-api-token" type="password" placeholder="输入 Cloudflare API Token" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;">
            <div id="token-help" style="margin-top: 6px; font-size: 11px; color: #569cd6; cursor: pointer; opacity: 0.8;">ℹ️ 如何获取 API Token？</div>
        </div>

        <!-- Divider -->
        <div style="height: 1px; background: #404040; margin-bottom: 16px;"></div>

        <!-- Env Tabs -->
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 8px; color: #9cdcfe; font-size: 12px;">环境配置</label>
            <div id="env-tabs" style="display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 1px solid #404040;"></div>
        </div>

        <!-- Tab Content -->
        <div id="tab-content" style="background: #252525; border: 1px solid #404040; border-radius: 6px; padding: 14px;"></div>

        <div id="status-text" style="min-height: 20px; font-size: 12px; color: #888; padding: 8px 0 0 0;"></div>
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
.env-tab-btn {
    flex: 1; padding: 7px 0; cursor: pointer; text-align: center; font-size: 12px;
    background: #2d2d2d; color: #888; border: none; outline: none; transition: all 0.15s;
}
.env-tab-btn:not(:last-child) { border-right: 1px solid #404040; }
.env-tab-btn.active { background: #0e639c; color: #fff; }
.env-tab-btn:hover:not(.active) { background: #383838; color: #d4d4d4; }
`;
exports.$ = {
    'input-api-token': '#input-api-token',
    'token-help': '#token-help',
    'env-tabs': '#env-tabs',
    'tab-content': '#tab-content',
    'btn-test': '#btn-test',
    'btn-save': '#btn-save',
    'status-text': '#status-text',
};
// 每个环境的数据暂存在这里
const envValues = {
    production: { projectName: '', domain: '' },
    staging: { projectName: '', domain: '' },
    dev: { projectName: '', domain: '' },
};
function saveCurrentTabValues() {
    var _a, _b;
    const pInput = (_a = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['tab-content']) === null || _a === void 0 ? void 0 : _a.querySelector('#env-project');
    const dInput = (_b = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['tab-content']) === null || _b === void 0 ? void 0 : _b.querySelector('#env-domain');
    if (pInput && dInput) {
        envValues[activeTab] = {
            projectName: pInput.value.trim(),
            domain: dInput.value.trim(),
        };
    }
}
function renderTab(key) {
    saveCurrentTabValues();
    activeTab = key;
    // 更新 tab 样式
    const tabs = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['env-tabs'];
    tabs === null || tabs === void 0 ? void 0 : tabs.querySelectorAll('.env-tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-key') === key);
    });
    // 渲染 tab 内容
    const content = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['tab-content'];
    const tab = envTabs.find(t => t.key === key);
    const val = envValues[key];
    content.innerHTML = `
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 3px; color: #9cdcfe; font-size: 11px;">Pages 项目名</label>
            <input id="env-project" type="text" value="${val.projectName}" placeholder="如 my-game${key === 'staging' ? '-staging' : key === 'dev' ? '-dev' : ''}" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 7px 10px; font-size: 13px; outline: none;">
            <div style="margin-top: 3px; font-size: 10px; color: #666;">在 Cloudflare Dashboard → Pages 中创建的项目名称</div>
        </div>
        <div>
            <label style="display: block; margin-bottom: 3px; color: #9cdcfe; font-size: 11px;">自定义域名（可选）</label>
            <input id="env-domain" type="text" value="${val.domain}" placeholder="如 ${key === 'production' ? 'game.com' : key + '.game.com'}" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 7px 10px; font-size: 13px; outline: none;">
        </div>
    `;
}
function setStatus(text, color) {
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    }
}
function ready() {
    panelRef = this;
    inputApiToken = this.$['input-api-token'];
    statusEl = this.$['status-text'];
    // 渲染 tabs
    const tabsEl = this.$['env-tabs'];
    tabsEl.innerHTML = envTabs.map(t => `<button class="env-tab-btn${t.key === 'production' ? ' active' : ''}" data-key="${t.key}">${t.label}</button>`).join('');
    tabsEl.querySelectorAll('.env-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-key');
            renderTab(key);
        });
    });
    // 渲染初始 tab
    renderTab('production');
    // 帮助链接
    const tokenHelp = this.$['token-help'];
    tokenHelp.addEventListener('click', () => {
        Editor.Dialog.info('如何获取 API Token\n\n'
            + '1. 打开 https://dash.cloudflare.com/profile/api-tokens\n'
            + '2. 点击「创建令牌」\n'
            + '3. 选择「创建自定义令牌」→ 开始使用\n'
            + '4. 令牌名称：填写如 cocos-pages\n'
            + '5. 权限：帐户 → Cloudflare Pages → 编辑\n'
            + '6. 帐户资源：包括 → 所有帐户\n'
            + '7. 点击「继续以显示摘要」→「创建令牌」\n'
            + '8. 复制生成的令牌粘贴到此处\n\n'
            + '⚠️ 令牌只会显示一次，请妥善保存。', { title: 'API Token 获取指南', buttons: ['知道了'] });
    });
    // 测试连接
    const btnTest = this.$['btn-test'];
    btnTest.addEventListener('click', () => {
        setStatus('正在测试连接...', '#569cd6');
        saveCurrentTabValues();
        const config = getFormValues();
        Editor.Message.send('framework-plugin', 'test-pages-connection', JSON.stringify(config));
    });
    // 保存
    const btnSave = this.$['btn-save'];
    btnSave.addEventListener('click', () => {
        saveCurrentTabValues();
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
    panelRef = null;
    inputApiToken = null;
    statusEl = null;
    activeTab = 'production';
    envValues.production = { projectName: '', domain: '' };
    envValues.staging = { projectName: '', domain: '' };
    envValues.dev = { projectName: '', domain: '' };
}
exports.close = close;
function getFormValues() {
    var _a;
    const pagesProjects = {};
    for (const t of envTabs) {
        pagesProjects[t.key] = Object.assign({}, envValues[t.key]);
    }
    return {
        pagesApiToken: ((_a = inputApiToken === null || inputApiToken === void 0 ? void 0 : inputApiToken.value) === null || _a === void 0 ? void 0 : _a.trim()) || '',
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
            for (const t of envTabs) {
                const proj = (_a = config.pagesProjects) === null || _a === void 0 ? void 0 : _a[t.key];
                envValues[t.key] = {
                    projectName: (proj === null || proj === void 0 ? void 0 : proj.projectName) || '',
                    domain: (proj === null || proj === void 0 ? void 0 : proj.domain) || '',
                };
            }
            renderTab(activeTab);
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