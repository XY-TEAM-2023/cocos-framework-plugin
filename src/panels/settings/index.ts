/**
 * 插件设置面板（合并 R2 + Pages + Android 配置）
 *
 * 顶部三个 Tab 切换 R2 / Pages / Android 配置区
 */

// ==================== 状态 ====================

let panelRef: any = null;
let activeSection: 'r2' | 'pages' | 'android' = 'r2';

// R2
let r2ConnectionVerified = false;

// Android
let androidEnvValues = { dev: true, beta: true, prod: true };

// Pages
let pagesActiveTab = 'production';
const pagesEnvTabs = [
    { key: 'production', label: '正式' },
    { key: 'staging', label: '预览' },
    { key: 'dev', label: '开发' },
];
const pagesEnvValues: Record<string, { projectName: string; domain: string }> = {
    production: { projectName: '', domain: '' },
    staging: { projectName: '', domain: '' },
    dev: { projectName: '', domain: '' },
};

// ==================== 模板 ====================

export const template = `
<div id="settings-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Auto Prompt Toggle -->
    <div id="auto-prompt-bar" style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #252525; border-bottom: 1px solid #404040;">
        <input type="checkbox" id="r2-auto-prompt" style="width: 15px; height: 15px; cursor: pointer; accent-color: #0e639c;">
        <label for="r2-auto-prompt" style="cursor: pointer; font-size: 12px; color: #d4d4d4; user-select: none;">构建后自动询问上传到 R2</label>
    </div>

    <!-- Section Tabs -->
    <div id="section-tabs" style="display: flex; background: #2d2d2d; border-bottom: 1px solid #404040;"></div>

    <!-- Content -->
    <div id="section-content" style="flex: 1; overflow-y: auto; padding: 16px;"></div>

    <!-- Status -->
    <div id="status-bar" style="min-height: 20px; font-size: 12px; color: #888; padding: 4px 16px;"></div>

    <!-- Buttons -->
    <div id="btn-bar" style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;"></div>
</div>
`;

export const style = `
#settings-panel input:focus { border-color: #0e639c !important; }
#settings-panel button:hover:not(:disabled) { opacity: 0.9; }
.section-tab {
    flex: 1; padding: 10px 0; cursor: pointer; text-align: center; font-size: 13px; font-weight: 500;
    background: #2d2d2d; color: #888; border: none; outline: none; transition: all 0.15s;
    border-bottom: 2px solid transparent;
}
.section-tab:not(:last-child) { border-right: 1px solid #404040; }
.section-tab.active { color: #569cd6; border-bottom-color: #569cd6; background: #1e1e1e; }
.section-tab:hover:not(.active) { background: #383838; color: #d4d4d4; }
.env-tab-btn {
    flex: 1; padding: 7px 0; cursor: pointer; text-align: center; font-size: 12px;
    background: #2d2d2d; color: #888; border: none; outline: none; transition: all 0.15s;
}
.env-tab-btn:not(:last-child) { border-right: 1px solid #404040; }
.env-tab-btn.active { background: #0e639c; color: #fff; }
.env-tab-btn:hover:not(.active) { background: #383838; color: #d4d4d4; }
.settings-field { margin-bottom: 14px; }
.settings-label { display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px; }
.settings-hint { margin-top: 3px; font-size: 11px; color: #666; }
.settings-input {
    width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4;
    border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;
}
.settings-btn {
    background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px;
    padding: 6px 14px; cursor: pointer; font-size: 12px;
}
.settings-btn-primary {
    background: #0e639c; color: #fff; border: none; border-radius: 4px;
    padding: 6px 16px; cursor: pointer; font-size: 12px;
}
.settings-btn-disabled {
    background: #555; color: #888; border: none; border-radius: 4px;
    padding: 6px 16px; cursor: not-allowed; font-size: 12px;
}
.settings-toggle {
    display: flex; align-items: center; gap: 8px; padding: 10px 0; cursor: pointer; user-select: none;
}
.settings-toggle input[type="checkbox"] {
    width: 16px; height: 16px; cursor: pointer; accent-color: #0e639c;
}
.settings-toggle label {
    cursor: pointer; font-size: 12px; color: #d4d4d4;
}
`;

export const $ = {
    'auto-prompt': '#r2-auto-prompt',
    'section-tabs': '#section-tabs',
    'section-content': '#section-content',
    'status-bar': '#status-bar',
    'btn-bar': '#btn-bar',
};

// ==================== R2 渲染 ====================

function renderR2Section() {
    const content = panelRef?.$['section-content'] as HTMLElement;
    const btnBar = panelRef?.$['btn-bar'] as HTMLElement;
    if (!content || !btnBar) return;

    content.innerHTML = `
        <div class="settings-field">
            <label class="settings-label">Cloudflare Account ID</label>
            <input id="r2-account-id" class="settings-input" type="text" placeholder="输入 Account ID">
            <div class="settings-hint">Cloudflare 控制台首页 → 右侧栏「Account ID」</div>
        </div>
        <div class="settings-field">
            <label class="settings-label">Access Key ID</label>
            <input id="r2-access-key-id" class="settings-input" type="text" placeholder="输入 Access Key ID">
            <div class="settings-hint">创建 API 令牌后页面「为 S3 客户端使用以下凭据」→「访问密钥 ID」</div>
        </div>
        <div class="settings-field">
            <label class="settings-label">Secret Access Key</label>
            <input id="r2-secret-access-key" class="settings-input" type="password" placeholder="输入 Secret Access Key">
            <div class="settings-hint">同上页面「为 S3 客户端使用以下凭据」→「机密访问密钥」，仅显示一次</div>
        </div>
        <div class="settings-field">
            <label class="settings-label">Bucket 名称</label>
            <input id="r2-bucket-name" class="settings-input" type="text" placeholder="输入 Bucket Name">
            <div class="settings-hint">R2 → 概述 → 选择已创建的存储桶名称</div>
        </div>
    `;

    btnBar.innerHTML = `
        <button id="btn-r2-test" class="settings-btn">测试连接</button>
        <button id="btn-r2-save" class="settings-btn-disabled" disabled>保存</button>
    `;

    // 输入变化时重置验证
    const resetR2 = () => {
        r2ConnectionVerified = false;
        const saveBtn = content.ownerDocument.getElementById('btn-r2-save') as HTMLButtonElement | null;
        if (saveBtn) {
            saveBtn.className = 'settings-btn-disabled';
            saveBtn.disabled = true;
        }
        setStatus('', '#888');
    };
    content.querySelectorAll('.settings-input').forEach(el => el.addEventListener('input', resetR2));

    // 测试连接
    btnBar.querySelector('#btn-r2-test')?.addEventListener('click', () => {
        setStatus('正在测试连接...', '#569cd6');
        const config = getR2FormValues();
        Editor.Message.send('framework-plugin', 'test-r2-connection', JSON.stringify(config));
    });

    // 保存
    btnBar.querySelector('#btn-r2-save')?.addEventListener('click', () => {
        if (!r2ConnectionVerified) {
            setStatus('⚠️ 请先测试连接', '#ce9178');
            return;
        }
        const config = getR2FormValues();
        Editor.Message.send('framework-plugin', 'save-r2-config', JSON.stringify(config));
    });

    // 加载现有配置
    Editor.Message.send('framework-plugin', 'load-settings-r2', '');
}

function getR2FormValues() {
    const content = panelRef?.$['section-content'] as HTMLElement;
    if (!content) return {};
    return {
        accountId: (content.querySelector('#r2-account-id') as HTMLInputElement)?.value?.trim() || '',
        accessKeyId: (content.querySelector('#r2-access-key-id') as HTMLInputElement)?.value?.trim() || '',
        secretAccessKey: (content.querySelector('#r2-secret-access-key') as HTMLInputElement)?.value?.trim() || '',
        bucketName: (content.querySelector('#r2-bucket-name') as HTMLInputElement)?.value?.trim() || '',
    };
}

// ==================== Pages 渲染 ====================

function renderPagesSection() {
    const content = panelRef?.$['section-content'] as HTMLElement;
    const btnBar = panelRef?.$['btn-bar'] as HTMLElement;
    if (!content || !btnBar) return;

    content.innerHTML = `
        <div class="settings-field">
            <label class="settings-label">API Token</label>
            <input id="pages-api-token" class="settings-input" type="password" placeholder="输入 Cloudflare API Token">
            <div id="pages-token-help" class="settings-hint" style="color: #569cd6; cursor: pointer; opacity: 0.8;">ℹ️ 如何获取 API Token？</div>
        </div>
        <div style="height: 1px; background: #404040; margin-bottom: 16px;"></div>
        <div class="settings-field">
            <label class="settings-label">环境配置</label>
            <div id="pages-env-tabs" style="display: flex; gap: 0; border-radius: 6px; overflow: hidden; border: 1px solid #404040;"></div>
        </div>
        <div id="pages-tab-content" style="background: #252525; border: 1px solid #404040; border-radius: 6px; padding: 14px;"></div>
    `;

    btnBar.innerHTML = `
        <button id="btn-pages-test" class="settings-btn">测试连接</button>
        <button id="btn-pages-save" class="settings-btn-primary">保存</button>
    `;

    // 渲染环境 tabs
    const envTabsEl = content.querySelector('#pages-env-tabs') as HTMLElement;
    envTabsEl.innerHTML = pagesEnvTabs.map(t =>
        `<button class="env-tab-btn${t.key === pagesActiveTab ? ' active' : ''}" data-key="${t.key}">${t.label}</button>`
    ).join('');

    envTabsEl.querySelectorAll('.env-tab-btn').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-key')!;
            renderPagesEnvTab(key);
        });
    });

    // 渲染初始 tab
    renderPagesEnvTab(pagesActiveTab);

    // 帮助
    content.querySelector('#pages-token-help')?.addEventListener('click', () => {
        Editor.Dialog.info(
            '如何获取 API Token\n\n'
            + '1. 打开 https://dash.cloudflare.com/profile/api-tokens\n'
            + '2. 点击「创建令牌」\n'
            + '3. 选择「创建自定义令牌」→ 开始使用\n'
            + '4. 令牌名称：填写如 cocos-pages\n'
            + '5. 权限：帐户 → Cloudflare Pages → 编辑\n'
            + '6. 帐户资源：包括 → 所有帐户\n'
            + '7. 点击「继续以显示摘要」→「创建令牌」\n'
            + '8. 复制生成的令牌粘贴到此处\n\n'
            + '⚠️ 令牌只会显示一次，请妥善保存。',
            { title: 'API Token 获取指南', buttons: ['知道了'] }
        );
    });

    // 测试连接
    btnBar.querySelector('#btn-pages-test')?.addEventListener('click', () => {
        setStatus('正在测试连接...', '#569cd6');
        savePagesCurrentTabValues();
        const config = getPagesFormValues();
        Editor.Message.send('framework-plugin', 'test-pages-connection', JSON.stringify(config));
    });

    // 保存
    btnBar.querySelector('#btn-pages-save')?.addEventListener('click', () => {
        savePagesCurrentTabValues();
        const config = getPagesFormValues();
        if (!config.pagesApiToken) {
            setStatus('⚠️ 请填写 API Token', '#ce9178');
            return;
        }
        Editor.Message.send('framework-plugin', 'save-pages-config', JSON.stringify(config));
    });

    // 加载现有配置
    Editor.Message.send('framework-plugin', 'load-settings-pages', '');
}

function savePagesCurrentTabValues() {
    const content = panelRef?.$['section-content'] as HTMLElement;
    if (!content) return;
    const pInput = content.querySelector('#env-project') as HTMLInputElement;
    const dInput = content.querySelector('#env-domain') as HTMLInputElement;
    if (pInput && dInput) {
        pagesEnvValues[pagesActiveTab] = {
            projectName: pInput.value.trim(),
            domain: dInput.value.trim(),
        };
    }
}

function renderPagesEnvTab(key: string) {
    savePagesCurrentTabValues();
    pagesActiveTab = key;

    const content = panelRef?.$['section-content'] as HTMLElement;
    if (!content) return;

    content.querySelectorAll('.env-tab-btn').forEach((btn: Element) => {
        btn.classList.toggle('active', btn.getAttribute('data-key') === key);
    });

    const tabContent = content.querySelector('#pages-tab-content') as HTMLElement;
    const val = pagesEnvValues[key];
    tabContent.innerHTML = `
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 3px; color: #9cdcfe; font-size: 11px;">Pages 项目名</label>
            <input id="env-project" type="text" value="${val.projectName}" placeholder="如 my-game${key === 'staging' ? '-staging' : key === 'dev' ? '-dev' : ''}" class="settings-input">
            <div style="margin-top: 3px; font-size: 10px; color: #666;">在 Cloudflare Dashboard → Pages 中创建的项目名称</div>
        </div>
        <div>
            <label style="display: block; margin-bottom: 3px; color: #9cdcfe; font-size: 11px;">自定义域名（可选）</label>
            <input id="env-domain" type="text" value="${val.domain}" placeholder="如 ${key === 'production' ? 'game.com' : key + '.game.com'}" class="settings-input">
        </div>
    `;
}

function getPagesFormValues() {
    const content = panelRef?.$['section-content'] as HTMLElement;
    if (!content) return { pagesApiToken: '', pagesProjects: {} };
    const pagesProjects: any = {};
    for (const t of pagesEnvTabs) {
        pagesProjects[t.key] = { ...pagesEnvValues[t.key] };
    }
    return {
        pagesApiToken: (content.querySelector('#pages-api-token') as HTMLInputElement)?.value?.trim() || '',
        pagesProjects,
    };
}

// ==================== Android 渲染 ====================

function renderAndroidSection() {
    const content = panelRef?.$['section-content'] as HTMLElement;
    const btnBar = panelRef?.$['btn-bar'] as HTMLElement;
    if (!content || !btnBar) return;

    content.innerHTML = `
        <div style="margin-bottom: 16px;">
            <div style="color: #569cd6; font-size: 14px; font-weight: bold; margin-bottom: 8px;">📱 Android 多环境打包</div>
            <div style="font-size: 12px; color: #888; margin-bottom: 16px;">
                构建完成后，自动为勾选的环境生成独立 APK。<br>
                每个 APK 包含不同的 env.json 配置文件。
            </div>
        </div>

        <div style="border: 1px solid #404040; border-radius: 6px; padding: 14px; background: #252525;">
            <label class="settings-label" style="margin-bottom: 10px;">选择要构建的环境</label>

            <div class="settings-toggle">
                <input type="checkbox" id="android-env-dev" ${androidEnvValues.dev ? 'checked' : ''}>
                <label for="android-env-dev">
                    <span style="color: #4ec9b0;">dev</span> - 开发环境
                </label>
            </div>
            <div style="font-size: 11px; color: #666; margin-left: 26px; margin-bottom: 8px;">
                env.json: { "env": "dev" } → app-dev.apk
            </div>

            <div class="settings-toggle">
                <input type="checkbox" id="android-env-beta" ${androidEnvValues.beta ? 'checked' : ''}>
                <label for="android-env-beta">
                    <span style="color: #ce9178;">beta</span> - 测试环境
                </label>
            </div>
            <div style="font-size: 11px; color: #666; margin-left: 26px; margin-bottom: 8px;">
                env.json: { "env": "beta" } → app-beta.apk
            </div>

            <div class="settings-toggle">
                <input type="checkbox" id="android-env-prod" ${androidEnvValues.prod ? 'checked' : ''}>
                <label for="android-env-prod">
                    <span style="color: #569cd6;">prod</span> - 正式环境
                </label>
            </div>
            <div style="font-size: 11px; color: #666; margin-left: 26px;">
                env.json: { "env": "prod" } → app-prod.apk
            </div>
        </div>

        <div style="margin-top: 16px; padding: 12px; background: #1a2332; border: 1px solid #1e3a5f; border-radius: 6px;">
            <div style="font-size: 12px; color: #569cd6; margin-bottom: 6px;">💡 产出目录</div>
            <div style="font-size: 11px; color: #9cdcfe; font-family: 'Courier New', monospace;">
                build_upload_assets/android/app/{version}/<br>
                ├── app-dev.apk<br>
                ├── app-beta.apk<br>
                ├── app-prod.apk<br>
                └── manifest.json
            </div>
        </div>
    `;

    btnBar.innerHTML = `
        <button id="btn-android-save" class="settings-btn-primary">保存</button>
    `;

    // 保存按钮
    btnBar.querySelector('#btn-android-save')?.addEventListener('click', () => {
        androidEnvValues = {
            dev: (content.querySelector('#android-env-dev') as HTMLInputElement)?.checked ?? true,
            beta: (content.querySelector('#android-env-beta') as HTMLInputElement)?.checked ?? true,
            prod: (content.querySelector('#android-env-prod') as HTMLInputElement)?.checked ?? true,
        };
        const config = { environments: { ...androidEnvValues } };
        Editor.Message.send('framework-plugin', 'save-android-config', JSON.stringify(config));
    });

    // 加载现有配置
    Editor.Message.send('framework-plugin', 'load-settings-android', '');
}

// ==================== 公共 ====================

function setStatus(text: string, color: string) {
    const el = panelRef?.$['status-bar'] as HTMLElement;
    if (el) {
        el.textContent = text;
        el.style.color = color;
    }
}

function switchSection(section: 'r2' | 'pages' | 'android') {
    activeSection = section;
    setStatus('', '#888');

    // 更新 tab 样式
    const tabsEl = panelRef?.$['section-tabs'] as HTMLElement;
    tabsEl?.querySelectorAll('.section-tab').forEach((btn: Element) => {
        btn.classList.toggle('active', btn.getAttribute('data-section') === section);
    });

    if (section === 'r2') {
        renderR2Section();
    } else if (section === 'pages') {
        renderPagesSection();
    } else if (section === 'android') {
        renderAndroidSection();
    }
}

// ==================== 生命周期 ====================

export function ready(this: any) {
    panelRef = this;

    // 自动上传开关
    const autoPromptCb = this.$['auto-prompt'] as HTMLInputElement;
    autoPromptCb?.addEventListener('change', () => {
        Editor.Message.send('framework-plugin', 'toggle-auto-prompt', autoPromptCb.checked ? 'true' : 'false');
    });

    // 渲染顶部 section tabs
    const tabsEl = this.$['section-tabs'] as HTMLElement;
    tabsEl.innerHTML = `
        <button class="section-tab active" data-section="r2">☁️ R2 存储</button>
        <button class="section-tab" data-section="pages">📄 Pages 部署</button>
        <button class="section-tab" data-section="android">📱 Android</button>
    `;

    tabsEl.querySelectorAll('.section-tab').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section') as 'r2' | 'pages' | 'android';
            switchSection(section);
        });
    });

    // 默认显示 R2
    switchSection('r2');
}

export function close() {
    panelRef = null;
    activeSection = 'r2';
    r2ConnectionVerified = false;
    pagesActiveTab = 'production';
    pagesEnvValues.production = { projectName: '', domain: '' };
    pagesEnvValues.staging = { projectName: '', domain: '' };
    pagesEnvValues.dev = { projectName: '', domain: '' };
    androidEnvValues = { dev: true, beta: true, prod: true };
}

// ==================== 面板方法（接收消息） ====================

export const methods = {
    /** 加载 R2 配置到表单 */
    loadR2Config(configStr: string) {
        if (activeSection !== 'r2') return;
        const content = panelRef?.$['section-content'] as HTMLElement;
        if (!content) return;
        try {
            const config = JSON.parse(configStr);
            const set = (id: string, val: string) => {
                const el = content.querySelector(`#${id}`) as HTMLInputElement;
                if (el) el.value = val || '';
            };
            set('r2-account-id', config.accountId);
            set('r2-access-key-id', config.accessKeyId);
            set('r2-secret-access-key', config.secretAccessKey);
            set('r2-bucket-name', config.bucketName);
            // 自动上传开关
            const autoPromptCb = panelRef?.$['auto-prompt'] as HTMLInputElement;
            if (autoPromptCb) autoPromptCb.checked = config.autoPromptAfterBuild !== false;
            r2ConnectionVerified = false;
        } catch (e) {
            console.error('[Settings] 加载 R2 配置失败', e);
        }
    },

    /** 设置 R2 状态（含连接验证结果） */
    setR2Status(dataStr: string) {
        try {
            const { text, color, verified } = JSON.parse(dataStr);
            setStatus(text, color);
            if (verified === true) {
                r2ConnectionVerified = true;
                const btnBar = panelRef?.$['btn-bar'] as HTMLElement;
                const saveBtn = btnBar?.querySelector('#btn-r2-save') as HTMLButtonElement | null;
                if (saveBtn) {
                    saveBtn.className = 'settings-btn-primary';
                    saveBtn.disabled = false;
                }
            } else if (verified === false) {
                r2ConnectionVerified = false;
                const btnBar = panelRef?.$['btn-bar'] as HTMLElement;
                const saveBtn = btnBar?.querySelector('#btn-r2-save') as HTMLButtonElement | null;
                if (saveBtn) {
                    saveBtn.className = 'settings-btn-disabled';
                    saveBtn.disabled = true;
                }
            }
        } catch {}
    },

    /** 加载 Pages 配置到表单 */
    loadPagesConfig(configStr: string) {
        if (activeSection !== 'pages') return;
        const content = panelRef?.$['section-content'] as HTMLElement;
        if (!content) return;
        try {
            const config = JSON.parse(configStr);
            const tokenInput = content.querySelector('#pages-api-token') as HTMLInputElement;
            if (tokenInput) tokenInput.value = config.pagesApiToken || '';
            for (const t of pagesEnvTabs) {
                const proj = config.pagesProjects?.[t.key];
                pagesEnvValues[t.key] = {
                    projectName: proj?.projectName || '',
                    domain: proj?.domain || '',
                };
            }
            renderPagesEnvTab(pagesActiveTab);
        } catch (e) {
            console.error('[Settings] 加载 Pages 配置失败', e);
        }
    },

    /** 设置 Pages 状态 */
    setPagesStatus(dataStr: string) {
        try {
            const { text, color } = JSON.parse(dataStr);
            setStatus(text, color);
        } catch {}
    },

    /** 加载 Android 配置到表单 */
    loadAndroidConfig(configStr: string) {
        if (activeSection !== 'android') return;
        const content = panelRef?.$['section-content'] as HTMLElement;
        if (!content) return;
        try {
            const config = JSON.parse(configStr);
            androidEnvValues = {
                dev: config.environments?.dev !== false,
                beta: config.environments?.beta !== false,
                prod: config.environments?.prod !== false,
            };
            const setChecked = (id: string, val: boolean) => {
                const el = content.querySelector(`#${id}`) as HTMLInputElement;
                if (el) el.checked = val;
            };
            setChecked('android-env-dev', androidEnvValues.dev);
            setChecked('android-env-beta', androidEnvValues.beta);
            setChecked('android-env-prod', androidEnvValues.prod);
        } catch (e) {
            console.error('[Settings] 加载 Android 配置失败', e);
        }
    },

    /** 设置 Android 状态 */
    setAndroidStatus(dataStr: string) {
        try {
            const { text, color } = JSON.parse(dataStr);
            setStatus(text, color);
        } catch {}
    },
};
