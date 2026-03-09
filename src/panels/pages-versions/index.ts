/**
 * Pages 版本切换面板
 *
 * 先选环境 → 显示该环境的部署列表 → 点击回滚
 */

let panelRef: any = null;

export const template = `
<div id="pages-versions-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">🔄 切换版本</span>
    </div>

    <!-- Env selector -->
    <div id="env-selector" style="padding: 10px 16px; background: #252525; border-bottom: 1px solid #404040; display: flex; gap: 6px;"></div>

    <!-- Loading -->
    <div id="loading" style="flex: 1; display: flex; align-items: center; justify-content: center; color: #888;">加载中...</div>

    <!-- Deployment list -->
    <div id="deployment-list" style="flex: 1; overflow-y: auto; padding: 8px 16px; display: none;"></div>

    <!-- Status bar -->
    <div id="status-bar" style="padding: 8px 16px; background: #2d2d2d; border-top: 1px solid #404040; font-size: 12px; color: #888; min-height: 20px;"></div>
</div>
`;

export const style = `
#pages-versions-panel button:hover:not(:disabled) { opacity: 0.9; }
.env-tab { padding: 4px 12px; border-radius: 4px; cursor: pointer; border: 1px solid #555; background: #3c3c3c; color: #d4d4d4; font-size: 12px; }
.env-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }
.env-tab.disabled { opacity: 0.4; cursor: not-allowed; }
.deploy-item { padding: 10px 12px; border-bottom: 1px solid #333; }
.deploy-item:last-child { border-bottom: none; }
`;

export const $ = {
    'env-selector': '#env-selector',
    'loading': '#loading',
    'deployment-list': '#deployment-list',
    'status-bar': '#status-bar',
};

export function ready(this: any) {
    panelRef = this;
}

export function close() {
    panelRef = null;
}

function renderDeployments(deployments: any[]) {
    const list = panelRef?.$['deployment-list'] as HTMLElement;
    const loading = panelRef?.$['loading'] as HTMLElement;
    if (!list || !loading) return;

    loading.style.display = 'none';
    list.style.display = '';

    if (deployments.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">该环境暂无部署</div>';
        return;
    }

    list.innerHTML = deployments.map((d: any) => {
        const isCurrent = d.is_current;
        const isSuccess = d.latest_stage?.status === 'success';
        const isFailed = d.latest_stage?.status === 'failure';
        const icon = isCurrent ? '🟢' : isSuccess ? '✅' : isFailed ? '❌' : '⏳';
        const statusLabel = isCurrent ? '当前版本' : isSuccess ? '成功' : isFailed ? '失败' : '进行中';
        const msg = d.deployment_trigger?.metadata?.commit_message || '无说明';
        const time = new Date(d.created_on).toLocaleString();
        const url = d.url || '';

        const btnHtml = (!isCurrent && isSuccess)
            ? `<button class="btn-rollback" data-id="${d.id}" data-msg="${msg.replace(/"/g, '&quot;')}" style="background: #0e639c; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 11px; margin-top: 6px;">切换到此版本</button>`
            : '';

        return `<div class="deploy-item">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <span>${icon}</span>
                <span style="font-weight: bold; color: #d4d4d4;">${msg}</span>
                <span style="font-size: 11px; color: #888; margin-left: auto;">${statusLabel}</span>
            </div>
            <div style="font-size: 11px; color: #666;">
                ${time}${url ? ` · <span style="color: #569cd6;">${url}</span>` : ''}
            </div>
            ${btnHtml}
        </div>`;
    }).join('');

    // 绑定回滚按钮
    list.querySelectorAll('.btn-rollback').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id')!;
            const msg = btn.getAttribute('data-msg')!;
            Editor.Dialog.warn(
                `确认切换版本\n\n目标版本: ${msg}\n\n⚠️ 确认切换到此版本？`,
                { buttons: ['确认切换', '取消'], default: 0, cancel: 1, title: '切换版本' }
            ).then((result: any) => {
                if (result.response === 0) {
                    const statusBar = panelRef?.$['status-bar'] as HTMLElement;
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

export const methods = {
    /** 设置环境标签页和部署数据 */
    setVersionsData(dataStr: string) {
        try {
            const data = JSON.parse(dataStr);
            const environments = data.environments || [];
            const deployments = data.deployments || [];
            const currentEnv = data.currentEnv || '';

            // 渲染环境标签
            const envSelector = panelRef?.$['env-selector'] as HTMLElement;
            if (envSelector) {
                envSelector.innerHTML = environments.map((e: any) => {
                    const disabled = !e.configured;
                    const active = e.env === currentEnv;
                    return `<span class="env-tab${active ? ' active' : ''}${disabled ? ' disabled' : ''}" data-env="${e.env}" style="padding: 4px 12px; border-radius: 4px; cursor: ${disabled ? 'not-allowed' : 'pointer'}; border: 1px solid ${active ? '#0e639c' : '#555'}; background: ${active ? '#0e639c' : '#3c3c3c'}; color: ${active ? '#fff' : disabled ? '#666' : '#d4d4d4'}; font-size: 12px;">${e.label}${disabled ? '(待配置)' : ''}</span>`;
                }).join('');

                envSelector.querySelectorAll('.env-tab:not(.disabled)').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const env = tab.getAttribute('data-env')!;
                        Editor.Message.send('framework-plugin', 'switch-pages-env', env);
                    });
                });
            }

            renderDeployments(deployments);
        } catch (e) {
            console.error('[Pages Versions] 数据设置失败', e);
        }
    },

    /** 更新状态栏 */
    setStatus(dataStr: string) {
        try {
            const { text, color } = JSON.parse(dataStr);
            const statusBar = panelRef?.$['status-bar'] as HTMLElement;
            if (statusBar) {
                statusBar.textContent = text;
                statusBar.style.color = color;
            }
        } catch {}
    },

    /** 刷新部署列表 */
    refreshDeployments(deploymentsStr: string) {
        try {
            const deployments = JSON.parse(deploymentsStr);
            renderDeployments(deployments);
        } catch {}
    },
};
