"use strict";
/**
 * Bundle 版本管理面板
 *
 * 树形结构展示各平台、各 Bundle 的当前版本（dev/beta/prod）
 * 支持切换指定环境的版本
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
let panelRef = null;
exports.template = `
<div id="bv-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">📦 Bundle 版本管理</span>
    </div>

    <!-- Platform Tabs -->
    <div id="platform-tabs" style="display: flex; background: #252526; border-bottom: 1px solid #3c3c3c; padding: 0 16px; overflow-x: auto;">
        <!-- Tabs injected here -->
    </div>

    <!-- Action Bar: Apply Latest -->
    <div id="action-bar" style="display: none; padding: 8px 16px; background: #252526; border-bottom: 1px solid #3c3c3c; align-items: center; gap: 8px;">
        <span style="color: #888; font-size: 12px; margin-right: 4px;">一键应用最新版本 →</span>
        <button class="apply-btn apply-dev" data-env="dev">🚀 DEV</button>
        <button class="apply-btn apply-beta" data-env="beta">🚀 BETA</button>
        <button class="apply-btn apply-prod" data-env="prod">🚀 PROD</button>
    </div>

    <!-- Content Area (Table Header) -->
    <div id="tree-container" style="flex: 1; overflow-y: auto; padding: 0;">
        <div id="tree-loading" style="text-align: center; color: #888; padding: 40px;">加载中...</div>
    </div>

    <!-- Version Selector (hidden by default) -->
    <div id="version-selector" style="display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 100;">
        <div style="margin: 60px auto; max-width: 400px; background: #2d2d2d; border-radius: 8px; border: 1px solid #555; overflow: hidden; display: flex; flex-direction: column; max-height: calc(100% - 120px);">
            <div style="padding: 12px 16px; background: #333; border-bottom: 1px solid #555;">
                <span id="vs-title" style="font-weight: bold; color: #9cdcfe; font-size: 13px;">选择版本</span>
            </div>
            <div id="vs-version-list" style="flex: 1; overflow-y: auto; padding: 8px 16px;"></div>
            <div style="padding: 10px 16px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #444;">
                <button id="vs-cancel" style="background: #555; color: #ddd; border: none; border-radius: 4px; padding: 5px 14px; cursor: pointer; font-size: 12px;">取消</button>
                <button id="vs-confirm" style="background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 5px 14px; cursor: pointer; font-size: 12px;" disabled>确定</button>
            </div>
        </div>
    </div>
</div>
`;
exports.style = `
#bv-panel button:hover:not(:disabled) { opacity: 0.9; }
.tab-btn { padding: 8px 16px; cursor: pointer; color: #888; border-bottom: 2px solid transparent; text-transform: capitalize; font-size: 13px; white-space: nowrap; }
.tab-btn:hover { color: #d4d4d4; }
.tab-btn.active { color: #4ec9b0; border-bottom-color: #4ec9b0; font-weight: bold; }

.apply-btn { border: none; border-radius: 4px; padding: 4px 12px; cursor: pointer; font-size: 12px; font-weight: bold; transition: opacity 0.2s, transform 0.1s; }
.apply-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
.apply-btn:active:not(:disabled) { transform: translateY(0); }
.apply-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.apply-dev { background: #2ea043; color: #fff; }
.apply-beta { background: #d29922; color: #1e1e1e; }
.apply-prod { background: #da3633; color: #fff; }

.bv-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.bv-table th { background: #252526; position: sticky; top: 0; z-index: 10; text-align: left; padding: 10px 12px; border-bottom: 1px solid #3c3c3c; color: #888; font-size: 11px; text-transform: uppercase; }
.bv-table td { padding: 8px 12px; border-bottom: 1px solid #2d2d2d; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bv-table tr:hover { background: #2a2d2e; }

.bv-bundle-cell { color: #dcdcaa; font-weight: bold; font-family: 'Menlo', 'Consolas', monospace; }
.bv-version-cell { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s; }
.bv-version-cell:hover { background: #3e3e3e; }
.bv-version-val { font-size: 12px; font-family: 'Menlo', 'Consolas', monospace; color: #4ec9b0; overflow: hidden; text-overflow: ellipsis; }
.bv-version-val.empty { color: #555; font-style: italic; }

.vs-ver-item { padding: 8px 12px; cursor: pointer; border-radius: 4px; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; border: 1px solid transparent; font-size: 12px; }
.vs-ver-item:hover { background: #3a3a3a; }
.vs-ver-item.selected { border-color: #0e639c; background: #0e639c1a; }
.vs-ver-item .vs-check { width: 18px; text-align: center; }
.vs-ver-item .vs-date { color: #d4d4d4; font-family: 'Menlo', 'Consolas', monospace; }
.vs-ver-item.current .vs-date { color: #6a9955; font-weight: bold; }
`;
exports.$ = {
    'platform-tabs': '#platform-tabs',
    'action-bar': '#action-bar',
    'tree-container': '#tree-container',
    'version-selector': '#version-selector',
    'vs-title': '#vs-title',
    'vs-version-list': '#vs-version-list',
    'vs-cancel': '#vs-cancel',
    'vs-confirm': '#vs-confirm',
};
let treeData = [];
let activePlatform = '';
let selectorState = null;
function formatVersion(v) {
    if (/^\d{12}$/.test(v)) {
        return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4, 6)} ${v.slice(6, 8)}:${v.slice(8, 10)}`;
    }
    return '';
}
function updateActionBar() {
    const actionBar = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['action-bar'];
    if (!actionBar)
        return;
    actionBar.style.display = activePlatform ? 'flex' : 'none';
}
function setApplyButtonsDisabled(disabled) {
    const actionBar = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['action-bar'];
    if (!actionBar)
        return;
    actionBar.querySelectorAll('.apply-btn').forEach(btn => {
        btn.disabled = disabled;
    });
}
function renderTree() {
    const container = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['tree-container'];
    if (!container)
        return;
    updateActionBar();
    if (!activePlatform) {
        container.innerHTML = '<div style="text-align: center; color: #888; padding: 60px;">请在上方选择一个平台管理 Bundle 版本</div>';
        return;
    }
    const platformBundles = treeData.filter(d => d.platform === activePlatform);
    if (platformBundles.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">该平台下未找到任何 Bundle</div>';
        return;
    }
    let html = `
    <table class="bv-table">
        <thead>
            <tr>
                <th style="width: 30%;">Bundle Name</th>
                <th>Dev</th>
                <th>Beta</th>
                <th>Prod</th>
            </tr>
        </thead>
        <tbody>
    `;
    platformBundles.forEach(node => {
        html += `
            <tr>
                <td class="bv-bundle-cell" title="${node.bundleName}">${node.bundleName}</td>
                ${renderVersionCell(node, 'dev')}
                ${renderVersionCell(node, 'beta')}
                ${renderVersionCell(node, 'prod')}
            </tr>
        `;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
    // 绑定点击事件到单元格
    container.querySelectorAll('.bv-version-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            const bundleName = cell.dataset.bundle;
            const env = cell.dataset.env;
            const current = cell.dataset.current;
            openVersionSelector(bundleName, env);
        });
    });
}
function renderVersionCell(node, env) {
    const v = node.versions[env];
    const dateStr = v ? formatVersion(v) : '';
    const displayV = dateStr || '未设置';
    return `
        <td>
            <div class="bv-version-cell" 
                data-platform="${node.platform}" 
                data-bundle="${node.bundleName}" 
                data-env="${env}" 
                data-current="${v || ''}"
                title="${v ? '版本号: ' + v : '点击设置版本'}">
                <div class="bv-version-val ${!v ? 'empty' : ''}">
                    ${displayV}
                </div>
            </div>
        </td>
    `;
}
function openVersionSelector(bundleName, env) {
    const node = treeData.find(n => n.platform === activePlatform && n.bundleName === bundleName);
    if (!node)
        return;
    selectorState = {
        platform: activePlatform,
        bundleName,
        env,
        selectedVersion: '',
        currentVersion: node.versions[env] || '',
        availableVersions: [],
        nextContinuationToken: undefined,
        loadingMore: false,
    };
    // 显示弹层
    const overlay = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['version-selector'];
    if (overlay)
        overlay.style.display = 'block';
    const titleEl = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['vs-title'];
    if (titleEl)
        titleEl.textContent = `设置 [${bundleName}] 的 ${env.toUpperCase()} 环境版本`;
    // 清空列表显示加载中
    const list = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['vs-version-list'];
    if (list)
        list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px; font-size: 12px;">加载版本列表中...</div>';
    // 禁用确认按钮
    updateConfirmButton();
    // 请求版本列表
    Editor.Message.send('framework-plugin', 'load-bundle-version-list', activePlatform, bundleName);
}
function renderVersionList() {
    const list = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['vs-version-list'];
    if (!list || !selectorState)
        return;
    if (selectorState.availableVersions.length === 0 && !selectorState.loadingMore) {
        list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px; font-size: 12px;">此 Bundle 没有历史版本</div>';
        return;
    }
    let html = selectorState.availableVersions.map(v => {
        const isCurrent = v === selectorState.currentVersion;
        const isSelected = v === selectorState.selectedVersion;
        const cls = ['vs-ver-item'];
        if (isSelected)
            cls.push('selected');
        if (isCurrent)
            cls.push('current');
        const dateStr = formatVersion(v);
        return `<div class="${cls.join(' ')}" data-ver="${v}" title="原始版本号: ${v}">
            <span class="vs-check">${isSelected ? '✅' : (isCurrent ? '🟢' : '')}</span>
            <span class="vs-date">${dateStr || v}</span>
            ${isCurrent ? '<span style="color:#6a9955;font-size:10px;margin-left:auto;">当前</span>' : ''}
        </div>`;
    }).join('');
    // 添加“加载更多”按钮
    if (selectorState.nextContinuationToken) {
        if (selectorState.loadingMore) {
            html += '<div style="text-align: center; color: #888; padding: 10px; font-size: 11px;">加载中...</div>';
        }
        else {
            html += '<div id="vs-load-more" style="text-align: center; color: #9cdcfe; padding: 10px; font-size: 11px; cursor: pointer;">加载更多...</div>';
        }
    }
    else if (selectorState.availableVersions.length > 0) {
        html += '<div style="text-align: center; color: #555; padding: 10px; font-size: 11px;">已显示全部版本</div>';
    }
    list.innerHTML = html;
    list.querySelectorAll('.vs-ver-item').forEach(el => {
        el.addEventListener('click', () => {
            if (!selectorState)
                return;
            const ver = el.dataset.ver;
            // 如果点击当前版本，取消选择
            if (ver === selectorState.currentVersion) {
                selectorState.selectedVersion = '';
            }
            else {
                selectorState.selectedVersion = ver;
            }
            renderVersionList();
            updateConfirmButton();
        });
    });
    // 绑定加载更多事件
    const btnLoadMore = list.querySelector('#vs-load-more');
    if (btnLoadMore) {
        btnLoadMore.addEventListener('click', () => {
            if (!selectorState || selectorState.loadingMore)
                return;
            selectorState.loadingMore = true;
            renderVersionList();
            Editor.Message.send('framework-plugin', 'load-bundle-version-list', selectorState.platform, selectorState.bundleName, selectorState.nextContinuationToken);
        });
    }
}
function updateConfirmButton() {
    const btn = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['vs-confirm'];
    if (!btn || !selectorState)
        return;
    btn.disabled = !selectorState.selectedVersion || selectorState.selectedVersion === selectorState.currentVersion;
}
function closeSelector() {
    const overlay = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['version-selector'];
    if (overlay)
        overlay.style.display = 'none';
    selectorState = null;
}
// ===== Panel Lifecycle =====
// ===== Panel Lifecycle =====
function ready() {
    console.log('[Bundle版本管理] 面板就绪');
    panelRef = this;
    // 取消按钮
    const btnCancel = this.$['vs-cancel'];
    btnCancel.addEventListener('click', closeSelector);
    // 确定按钮
    const btnConfirm = this.$['vs-confirm'];
    btnConfirm.addEventListener('click', async () => {
        if (!selectorState || !selectorState.selectedVersion)
            return;
        const { platform, bundleName, env, selectedVersion } = selectorState;
        const result = await Editor.Dialog.info(`是否确定将 ${platform} 平台的 ${bundleName}\n的 ${env} 版本切换为 ${selectedVersion}？`, { buttons: ['确定', '取消'], default: 0, cancel: 1 });
        if (result.response === 0) {
            console.log(`[Bundle版本管理] 确认切换版本: ${bundleName} -> ${env}:${selectedVersion}`);
            closeSelector();
            Editor.Message.send('framework-plugin', 'switch-bundle-version', platform, bundleName, env, selectedVersion);
        }
    });
    // 一键应用最新版本按钮
    const actionBar = this.$['action-bar'];
    actionBar.querySelectorAll('.apply-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!activePlatform)
                return;
            const env = btn.dataset.env;
            const envLabel = env.toUpperCase();
            const result = await Editor.Dialog.info(`确定要将 ${activePlatform} 平台下所有 Bundle 的最新版本应用到 ${envLabel} 环境吗？`, { buttons: ['确定', '取消'], default: 0, cancel: 1 });
            if (result.response === 0) {
                console.log(`[Bundle版本管理] 一键应用最新: ${activePlatform} → ${envLabel}`);
                setApplyButtonsDisabled(true);
                Editor.Message.send('framework-plugin', 'apply-latest-to-env', activePlatform, env);
            }
        });
    });
    // 初始加载平台列表
    console.log('[Bundle版本管理] 发送初始加载平台列表消息');
    Editor.Message.send('framework-plugin', 'load-bundle-platforms');
}
exports.ready = ready;
function close() {
    console.log('[Bundle版本管理] 面板关闭');
    panelRef = null;
}
exports.close = close;
// ===== Messages from main.ts =====
exports.methods = {
    setBundlePlatforms(jsonStr) {
        console.log('[Bundle版本管理] 收到平台列表数据');
        try {
            const platforms = JSON.parse(jsonStr);
            if (platforms.length === 0) {
                console.warn('[Bundle版本管理] 平台列表为空');
                const tabsCont = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['platform-tabs'];
                if (tabsCont)
                    tabsCont.innerHTML = '<div style="padding: 8px 16px; color: #888; font-size: 13px;">没有找到任何平台</div>';
                return;
            }
            // 用户要求：不要默认选中，让用户自己选
            activePlatform = '';
            console.log(`[Bundle版本管理] 等待用户选择平台...`);
            const tabsCont = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['platform-tabs'];
            if (tabsCont) {
                tabsCont.innerHTML = platforms.map(p => {
                    const cls = p === activePlatform ? 'tab-btn active' : 'tab-btn';
                    return `<div class="${cls}" data-platform="${p}">${p}</div>`;
                }).join('');
                tabsCont.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const newPlatform = btn.dataset.platform;
                        if (newPlatform === activePlatform)
                            return;
                        console.log(`[Bundle版本管理] 选中平台: ${newPlatform}`);
                        activePlatform = newPlatform;
                        // 更新 Tab 高亮
                        tabsCont.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        // 显示加载中并请求数据
                        const container = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['tree-container'];
                        if (container)
                            container.innerHTML = '<div style="text-align: center; color: #888; padding: 40px;">加载中...</div>';
                        Editor.Message.send('framework-plugin', 'load-bundle-tree-by-platform', activePlatform);
                    });
                });
            }
            // 初始状态：提示用户选择
            const container = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['tree-container'];
            if (container) {
                container.innerHTML = '<div style="text-align: center; color: #888; padding: 60px;">请在上方选择一个平台管理 Bundle 版本</div>';
            }
        }
        catch (e) {
            console.error('[Bundle版本管理] 解析平台列表失败', e);
        }
    },
    setBundleTree(jsonStr) {
        console.log('[Bundle版本管理] 收到 Bundle 树数据');
        try {
            treeData = JSON.parse(jsonStr);
            console.log(`[Bundle版本管理] 成功解析 ${treeData.length} 个 Bundle`);
        }
        catch (_a) {
            treeData = [];
            console.error('[Bundle版本管理] 解析 Bundle 树数据失败');
        }
        renderTree();
    },
    setBundleVersionList(jsonStr) {
        if (!selectorState)
            return;
        try {
            const data = JSON.parse(jsonStr);
            if (selectorState.loadingMore) {
                // 追加
                selectorState.availableVersions.push(...data.versions);
            }
            else {
                // 首次覆盖
                selectorState.availableVersions = data.versions;
            }
            selectorState.nextContinuationToken = data.nextContinuationToken;
        }
        catch (_a) {
            if (!selectorState.loadingMore)
                selectorState.availableVersions = [];
        }
        finally {
            selectorState.loadingMore = false;
        }
        renderVersionList();
        updateConfirmButton();
    },
    switchBundleVersionResult(success, msg) {
        if (success) {
            // 刷新当前平台的树
            if (activePlatform) {
                Editor.Message.send('framework-plugin', 'load-bundle-tree-by-platform', activePlatform);
            }
        }
        else {
            Editor.Dialog.warn(msg || '切换失败', { buttons: ['确定'] });
        }
    },
    applyLatestResult(jsonStr) {
        setApplyButtonsDisabled(false);
        try {
            const data = JSON.parse(jsonStr);
            if (data.success) {
                Editor.Dialog.info(data.message, { buttons: ['确定'] });
                // 刷新当前平台的树
                if (activePlatform) {
                    Editor.Message.send('framework-plugin', 'load-bundle-tree-by-platform', activePlatform);
                }
            }
            else {
                Editor.Dialog.warn(data.message || '操作失败', { buttons: ['确定'] });
            }
        }
        catch (_a) {
            Editor.Dialog.warn('结果解析失败', { buttons: ['确定'] });
        }
    },
};
//# sourceMappingURL=index.js.map