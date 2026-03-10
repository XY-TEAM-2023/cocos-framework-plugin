"use strict";
/**
 * Pages version switch panel
 *
 * Select env -> show deployment table -> rollback
 * Supports paginated loading
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
let panelRef = null;
let currentPage = 1;
let hasMore = false;
let currentDeployments = [];
exports.template = `
<div id="pages-versions-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">&#x1F504; 切换版本</span>
        <div id="status-text" style="font-size: 12px; color: #888;"></div>
    </div>

    <!-- Env selector -->
    <div id="env-selector" style="padding: 10px 16px; background: #252525; border-bottom: 1px solid #404040; display: flex; gap: 6px;"></div>

    <!-- Main Content -->
    <div style="flex: 1; overflow-y: auto; padding: 0;">
        <table id="deployment-table" style="width: 100%; border-collapse: collapse; display: none;">
            <thead>
                <tr style="background: #252525; position: sticky; top: 0; z-index: 1;">
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #404040; color: #888; width: 40px;">状态</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #404040; color: #888;">版本说明 / URL</th>
                    <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid #404040; color: #888; width: 140px;">部署时间</th>
                    <th style="padding: 10px 12px; text-align: center; border-bottom: 1px solid #404040; color: #888; width: 100px;">操作</th>
                </tr>
            </thead>
            <tbody id="deployment-list"></tbody>
        </table>

        <!-- Loading / Empty -->
        <div id="loading" style="display: flex; align-items: center; justify-content: center; padding: 40px; color: #888;">加载中...</div>
        <div id="empty-hint" style="display: none; text-align: center; padding: 40px; color: #666;">该环境暂无部署</div>

        <!-- Load More -->
        <div id="load-more-container" style="padding: 12px; text-align: center; display: none;">
            <button id="btn-load-more" style="background: transparent; color: #569cd6; border: 1px solid #569cd6; border-radius: 4px; padding: 6px 20px; cursor: pointer; font-size: 12px;">加载更多...</button>
        </div>
        <div id="no-more-hint" style="display: none; text-align: center; padding: 12px; color: #555; font-size: 12px;">— 没有更多了 —</div>
    </div>

    <!-- Status bar -->
    <div id="status-bar" style="padding: 8px 16px; background: #2d2d2d; border-top: 1px solid #404040; font-size: 12px; color: #888; min-height: 20px;"></div>
</div>
`;
exports.style = `
#pages-versions-panel button:hover:not(:disabled) { opacity: 0.8; }
#pages-versions-panel button:active:not(:disabled) { opacity: 0.6; }
.env-tab { padding: 4px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #555; background: #3c3c3c; color: #d4d4d4; font-size: 12px; transition: all 0.2s; }
.env-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }
.env-tab.disabled { opacity: 0.4; cursor: not-allowed; }
.deploy-row { cursor: pointer; transition: background 0.15s; }
.deploy-row:hover { background: rgba(255, 255, 255, 0.05); }
.deploy-row.selected { background: rgba(14, 99, 156, 0.25); border-left: 2px solid #569cd6; }
.deploy-row td { padding: 10px 12px; border-bottom: 1px solid #333; vertical-align: middle; }
.btn-rollback { background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 11px; white-space: nowrap; }
`;
exports.$ = {
    'env-selector': '#env-selector',
    'loading': '#loading',
    'deployment-table': '#deployment-table',
    'deployment-list': '#deployment-list',
    'empty-hint': '#empty-hint',
    'load-more-container': '#load-more-container',
    'no-more-hint': '#no-more-hint',
    'btn-load-more': '#btn-load-more',
    'status-bar': '#status-bar',
    'status-text': '#status-text',
};
function ready() {
    panelRef = this;
    const btnLoadMore = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['btn-load-more'];
    if (btnLoadMore) {
        btnLoadMore.onclick = () => {
            btnLoadMore.textContent = '加载中...';
            btnLoadMore.disabled = true;
            Editor.Message.send('framework-plugin', 'load-more-pages-versions', JSON.stringify({ page: currentPage + 1 }));
        };
    }
}
exports.ready = ready;
function close() {
    panelRef = null;
    currentPage = 1;
    hasMore = false;
    currentDeployments = [];
}
exports.close = close;
function renderDeployments(deployments, isAppend) {
    const list = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['deployment-list'];
    const table = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['deployment-table'];
    const loading = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['loading'];
    const emptyHint = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['empty-hint'];
    const loadMoreContainer = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['load-more-container'];
    const noMoreHint = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['no-more-hint'];
    if (!list || !table || !loading)
        return;
    loading.style.display = 'none';
    if (!isAppend) {
        list.innerHTML = '';
        currentDeployments = [];
    }
    currentDeployments = currentDeployments.concat(deployments);
    if (currentDeployments.length === 0) {
        table.style.display = 'none';
        emptyHint.style.display = 'block';
        if (loadMoreContainer)
            loadMoreContainer.style.display = 'none';
        if (noMoreHint)
            noMoreHint.style.display = 'none';
        return;
    }
    table.style.display = 'table';
    emptyHint.style.display = 'none';
    if (loadMoreContainer)
        loadMoreContainer.style.display = hasMore ? 'block' : 'none';
    if (noMoreHint)
        noMoreHint.style.display = (!hasMore && currentDeployments.length > 0) ? 'block' : 'none';
    const btnLoadMore = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['btn-load-more'];
    if (btnLoadMore) {
        btnLoadMore.textContent = '加载更多...';
        btnLoadMore.disabled = false;
    }
    const rowsHtml = deployments.map((d) => {
        var _a, _b, _c, _d;
        const isCurrent = d.is_current;
        const isSuccess = ((_a = d.latest_stage) === null || _a === void 0 ? void 0 : _a.status) === 'success';
        const isFailed = ((_b = d.latest_stage) === null || _b === void 0 ? void 0 : _b.status) === 'failure';
        const iconColor = isCurrent ? '#4ec9b0' : isSuccess ? '#6a9955' : isFailed ? '#f44747' : '#888';
        const icon = '\u25CF';
        const statusLabel = isCurrent ? '当前版本' : isSuccess ? '成功' : isFailed ? '失败' : '进行中';
        const msg = ((_d = (_c = d.deployment_trigger) === null || _c === void 0 ? void 0 : _c.metadata) === null || _d === void 0 ? void 0 : _d.commit_message) || '无说明';
        const time = new Date(d.created_on).toLocaleString('zh-CN', { hour12: false });
        const url = d.url || '';
        const btnHtml = (!isCurrent && isSuccess)
            ? `<button class="btn-rollback" data-id="${d.id}" data-msg="${msg.replace(/"/g, '&quot;')}">切换到此版本</button>`
            : `<span style="color: #666; font-size: 11px;">${statusLabel}</span>`;
        return `<tr class="deploy-row">
            <td style="text-align: center; font-size: 14px; color: ${iconColor};">${icon}</td>
            <td>
                <div style="font-weight: bold; color: #d4d4d4; margin-bottom: 2px;">${msg}</div>
                ${url ? `<div style="font-size: 11px; color: #569cd6;">${url}</div>` : ''}
            </td>
            <td style="font-size: 11px; color: #888;">${time}</td>
            <td style="text-align: center;">${btnHtml}</td>
        </tr>`;
    }).join('');
    if (isAppend) {
        list.insertAdjacentHTML('beforeend', rowsHtml);
    }
    else {
        list.innerHTML = rowsHtml;
    }
    list.querySelectorAll('.btn-rollback').forEach(btn => {
        if (btn._bound)
            return;
        btn._bound = true;
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const msg = btn.getAttribute('data-msg');
            Editor.Dialog.warn('确认切换版本\n\n目标版本: ' + msg, { buttons: ['确认切换', '取消'], default: 0, cancel: 1, title: '切换版本' }).then((result) => {
                if (result.response === 0) {
                    const statusBar = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['status-bar'];
                    if (statusBar) {
                        statusBar.textContent = '正在切换...';
                        statusBar.style.color = '#569cd6';
                    }
                    Editor.Message.send('framework-plugin', 'do-switch-pages-version', JSON.stringify({ deploymentId: id }));
                }
            });
        });
    });
}
exports.methods = {
    setVersionsData(dataStr) {
        try {
            const data = JSON.parse(dataStr);
            const environments = data.environments;
            const deployments = data.deployments || [];
            const currentEnv = data.currentEnv || '';
            const page = data.page || 1;
            currentPage = page;
            hasMore = !!data.hasMore;
            if (page === 1 && environments) {
                const envSelector = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['env-selector'];
                if (envSelector) {
                    envSelector.innerHTML = environments.map((e) => {
                        const disabled = !e.configured;
                        const active = e.env === currentEnv;
                        return `<span class="env-tab${active ? ' active' : ''}${disabled ? ' disabled' : ''}" data-env="${e.env}">${e.label}${disabled ? '(待配置)' : ''}</span>`;
                    }).join('');
                    envSelector.querySelectorAll('.env-tab:not(.disabled)').forEach(tab => {
                        tab.onclick = () => {
                            const env = tab.getAttribute('data-env');
                            const loading = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['loading'];
                            const table = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['deployment-table'];
                            const emptyHint = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['empty-hint'];
                            const loadMoreContainer = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['load-more-container'];
                            const noMoreHint = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['no-more-hint'];
                            if (loading)
                                loading.style.display = 'flex';
                            if (table)
                                table.style.display = 'none';
                            if (emptyHint)
                                emptyHint.style.display = 'none';
                            if (loadMoreContainer)
                                loadMoreContainer.style.display = 'none';
                            if (noMoreHint)
                                noMoreHint.style.display = 'none';
                            Editor.Message.send('framework-plugin', 'switch-pages-env', env);
                        };
                    });
                }
            }
            renderDeployments(deployments, page > 1);
            const statusBar = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['status-bar'];
            if (statusBar)
                statusBar.textContent = '共 ' + currentDeployments.length + ' 条记录';
        }
        catch (e) {
            console.error('[Pages Versions] 数据设置失败', e);
        }
    },
    setStatus(dataStr) {
        try {
            const { text, color } = JSON.parse(dataStr);
            const statusBar = panelRef === null || panelRef === void 0 ? void 0 : panelRef.$['status-bar'];
            if (statusBar) {
                statusBar.textContent = text;
                statusBar.style.color = color || '#888';
            }
        }
        catch (_a) { }
    },
};
//# sourceMappingURL=index.js.map