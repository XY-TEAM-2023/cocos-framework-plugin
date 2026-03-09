"use strict";
/**
 * Pages 清理版本面板
 *
 * 先选环境 → 显示部署列表（多选框）→ 锁定项不可选 → 确认清理
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
let panelRef = null;
let allDeployments = [];
exports.template = `
<div id="pages-cleanup-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">🧹 清理版本</span>
    </div>

    <!-- Env selector -->
    <div id="env-selector" style="padding: 10px 16px; background: #252525; border-bottom: 1px solid #404040; display: flex; gap: 6px;"></div>

    <!-- Loading -->
    <div id="loading" style="flex: 1; display: flex; align-items: center; justify-content: center; color: #888;">加载中...</div>

    <!-- Deployment list with checkboxes -->
    <div id="deployment-list" style="flex: 1; overflow-y: auto; padding: 8px 16px; display: none;"></div>

    <!-- Bottom bar -->
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;">
        <span id="selected-count" style="font-size: 12px; color: #888;">已选择 0 个版本</span>
        <button id="btn-cleanup" style="background: #c53030; color: #fff; border: none; border-radius: 4px; padding: 6px 14px; cursor: not-allowed; font-size: 12px; opacity: 0.5;" disabled>清理选中版本</button>
    </div>
</div>
`;
exports.style = `
#pages-cleanup-panel button:hover:not(:disabled) { opacity: 0.9; }
.env-tab { padding: 4px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #555; background: #3c3c3c; color: #d4d4d4; font-size: 12px; }
.env-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }
.env-tab.disabled { opacity: 0.4; cursor: not-allowed; }
.cleanup-item { padding: 8px 12px; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 8px; }
.cleanup-item:last-child { border-bottom: none; }
.cleanup-item.locked { opacity: 0.5; }
`;
exports.$ = {
    'env-selector': '#env-selector',
    'loading': '#loading',
    'deployment-list': '#deployment-list',
    'selected-count': '#selected-count',
    'btn-cleanup': '#btn-cleanup',
};
function updateSelectedCount() {
    const list = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['deployment-list'];
    const countEl = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['selected-count'];
    const btnCleanup = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['btn-cleanup'];
    if (!list || !countEl || !btnCleanup)
        return;
    const checked = list.querySelectorAll('input[type="checkbox"]:checked');
    const count = checked.length;
    countEl.textContent = `已选择 ${count} 个版本`;
    if (count > 0) {
        btnCleanup.disabled = false;
        btnCleanup.style.cursor = 'pointer';
        btnCleanup.style.opacity = '1';
    }
    else {
        btnCleanup.disabled = true;
        btnCleanup.style.cursor = 'not-allowed';
        btnCleanup.style.opacity = '0.5';
    }
}
function getSelectedIds() {
    const list = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['deployment-list'];
    if (!list)
        return [];
    const checked = list.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(el => el.value);
}
function renderDeployments(deployments) {
    allDeployments = deployments;
    const list = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['deployment-list'];
    const loading = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['loading'];
    if (!list || !loading)
        return;
    loading.style.display = 'none';
    list.style.display = '';
    if (deployments.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">该环境暂无部署</div>';
        return;
    }
    list.innerHTML = deployments.map((d) => {
        var _a, _b, _c;
        const locked = d.locked;
        const lockReason = d.lockReason || '';
        const icon = d.is_current ? '🟢' : ((_a = d.latest_stage) === null || _a === void 0 ? void 0 : _a.status) === 'success' ? '✅' : '❌';
        const msg = ((_c = (_b = d.deployment_trigger) === null || _b === void 0 ? void 0 : _b.metadata) === null || _c === void 0 ? void 0 : _c.commit_message) || '无说明';
        const time = new Date(d.created_on).toLocaleString();
        const checkboxHtml = locked
            ? `<span style="font-size: 14px;" title="${lockReason}">🔒</span>`
            : `<input type="checkbox" value="${d.id}" style="cursor: pointer;">`;
        return `<div class="cleanup-item${locked ? ' locked' : ''}">
            ${checkboxHtml}
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span>${icon}</span>
                    <span>${msg}</span>
                    ${locked ? `<span style="font-size: 10px; color: #ce9178;">${lockReason}</span>` : ''}
                </div>
                <div style="font-size: 11px; color: #666; margin-top: 2px;">${time}</div>
            </div>
        </div>`;
    }).join('');
    // 绑定 checkbox
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', updateSelectedCount);
    });
    updateSelectedCount();
}
function ready() {
    panelRef = this;
    const btnCleanup = this.$['btn-cleanup'];
    btnCleanup.addEventListener('click', () => {
        const ids = getSelectedIds();
        if (ids.length === 0)
            return;
        Editor.Dialog.warn(`确认清理\n\n将删除 ${ids.length} 个部署版本。\n\n⚠️ 此操作不可撤销，确认继续？`, { buttons: ['确认清理', '取消'], default: 0, cancel: 1, title: '⚠️ 清理确认' }).then((result) => {
            if (result.response === 0) {
                Editor.Message.send('framework-plugin', 'do-cleanup-pages-versions', JSON.stringify({ ids }));
            }
        });
    });
}
exports.ready = ready;
function close() {
    panelRef = null;
    allDeployments = [];
}
exports.close = close;
exports.methods = {
    /** 设置环境标签页和部署数据 */
    setCleanupData(dataStr) {
        try {
            const data = JSON.parse(dataStr);
            const environments = data.environments || [];
            const deployments = data.deployments || [];
            const currentEnv = data.currentEnv || '';
            // 渲染环境标签
            const envSelector = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['env-selector'];
            if (envSelector) {
                envSelector.innerHTML = environments.map((e) => {
                    const disabled = !e.configured;
                    const active = e.env === currentEnv;
                    return `<span class="env-tab${active ? ' active' : ''}${disabled ? ' disabled' : ''}" data-env="${e.env}" style="padding: 4px 12px; border-radius: 4px; cursor: ${disabled ? 'not-allowed' : 'pointer'}; border: 1px solid ${active ? '#0e639c' : '#555'}; background: ${active ? '#0e639c' : '#3c3c3c'}; color: ${active ? '#fff' : disabled ? '#666' : '#d4d4d4'}; font-size: 12px;">${e.label}${disabled ? '(待配置)' : ''}</span>`;
                }).join('');
                envSelector.querySelectorAll('.env-tab:not(.disabled)').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const env = tab.getAttribute('data-env');
                        Editor.Message.send('framework-plugin', 'cleanup-pages-env', env);
                    });
                });
            }
            renderDeployments(deployments);
        }
        catch (e) {
            console.error('[Pages Cleanup] 数据设置失败', e);
        }
    },
    /** 更新清理进度 */
    setCleanupProgress(dataStr) {
        try {
            const { current, total, status } = JSON.parse(dataStr);
            const countEl = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['selected-count'];
            if (countEl) {
                countEl.textContent = `清理中 ${current}/${total}... ${status}`;
                countEl.style.color = '#569cd6';
            }
        }
        catch (_a) { }
    },
    /** 清理完成 */
    setCleanupComplete(resultStr) {
        try {
            const { success, failed } = JSON.parse(resultStr);
            const countEl = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['selected-count'];
            if (countEl) {
                countEl.textContent = `✅ 清理完成: ${success} 成功, ${failed} 失败`;
                countEl.style.color = '#4ec9b0';
            }
        }
        catch (_a) { }
    },
};
//# sourceMappingURL=index.js.map