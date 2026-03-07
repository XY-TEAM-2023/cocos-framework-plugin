/**
 * 上传到 R2 - 面板
 * 
 * 功能：
 *   - 树形多选：platform > bundleName / version
 *   - 上传进度反馈（进度条 + 文件状态）
 *   - 取消上传按钮
 *   - 锁定/解锁状态切换
 */

let treeContainer: HTMLElement | null = null;
let progressContainer: HTMLElement | null = null;
let btnUpload: HTMLElement | null = null;
let btnCancel: HTMLElement | null = null;
let btnSelectAll: HTMLElement | null = null;
let btnDeselectAll: HTMLElement | null = null;
let progressBar: HTMLElement | null = null;
let progressText: HTMLElement | null = null;
let statusText: HTMLElement | null = null;

export const template = `
<div id="upload-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span id="panel-title" style="font-weight: bold; color: #569cd6;">☁️ 上传到 R2</span>
        <div style="display: flex; gap: 6px;">
            <button id="btn-select-all" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 11px;">全选</button>
            <button id="btn-deselect-all" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 11px;">取消全选</button>
        </div>
    </div>

    <!-- Hint -->
    <div style="padding: 4px 12px; font-size: 11px; color: #666; background: #252525; border-bottom: 1px solid #333;">💡 仅显示最后一次构建的版本</div>

    <!-- Tree -->
    <div id="tree-container" style="flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 2;"></div>

    <!-- Progress area -->
    <div id="progress-container" style="padding: 8px 12px; background: #252525; border-top: 1px solid #404040;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span id="progress-text" style="color: #569cd6;">就绪</span>
            <span id="status-text" style="color: #6a9955;"></span>
        </div>
        <div style="width: 100%; height: 6px; background: #3c3c3c; border-radius: 3px; overflow: hidden;">
            <div id="progress-bar" style="width: 0%; height: 100%; background: #0e639c; border-radius: 3px; transition: width 0.3s ease;"></div>
        </div>
        <div id="upload-log" style="max-height: 120px; overflow-y: auto; margin-top: 6px; font-size: 11px; color: #888;"></div>
    </div>

    <!-- Buttons -->
    <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; background: #2d2d2d; border-top: 1px solid #404040;">
        <button id="btn-cancel" style="display: none; background: #a1260d; color: #fff; border: none; border-radius: 3px; padding: 6px 14px; cursor: pointer; font-size: 12px;">取消上传</button>
        <button id="btn-upload" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 6px 16px; cursor: pointer; font-size: 12px;">开始上传</button>
    </div>
</div>
`;

export const style = `
#upload-panel ::-webkit-scrollbar {
    width: 8px;
}
#upload-panel ::-webkit-scrollbar-track {
    background: #1e1e1e;
}
#upload-panel ::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
}
#upload-panel ::-webkit-scrollbar-thumb:hover {
    background: #777;
}
.tree-platform {
    margin-bottom: 6px;
}
.tree-platform-label {
    font-weight: bold;
    color: #dcdcaa;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
}
.tree-bundle {
    margin-left: 20px;
    padding: 2px 0;
    display: flex;
    align-items: center;
    gap: 6px;
}
.tree-bundle label {
    cursor: pointer;
    color: #d4d4d4;
}
.tree-bundle label:hover {
    color: #fff;
}
input[type="checkbox"] {
    accent-color: #0e639c;
    cursor: pointer;
}
`;

export const $ = {
    'tree-container': '#tree-container',
    'progress-container': '#progress-container',
    'progress-bar': '#progress-bar',
    'progress-text': '#progress-text',
    'status-text': '#status-text',
    'btn-upload': '#btn-upload',
    'btn-cancel': '#btn-cancel',
    'btn-select-all': '#btn-select-all',
    'btn-deselect-all': '#btn-deselect-all',
    'panel-title': '#panel-title',
};

export function ready(this: any) {
    treeContainer = this.$['tree-container'] as HTMLElement;
    progressContainer = this.$['progress-container'] as HTMLElement;
    progressBar = this.$['progress-bar'] as HTMLElement;
    progressText = this.$['progress-text'] as HTMLElement;
    statusText = this.$['status-text'] as HTMLElement;
    btnUpload = this.$['btn-upload'] as HTMLElement;
    btnCancel = this.$['btn-cancel'] as HTMLElement;
    btnSelectAll = this.$['btn-select-all'] as HTMLElement;
    btnDeselectAll = this.$['btn-deselect-all'] as HTMLElement;

    btnUpload.addEventListener('click', () => {
        const selected = getSelectedEntries();
        if (selected.length === 0) {
            statusText!.textContent = '⚠️ 请至少选择一个版本';
            statusText!.style.color = '#ce9178';
            return;
        }
        Editor.Message.send('framework-plugin', 'do-upload-to-r2', JSON.stringify(selected));
    });

    btnCancel.addEventListener('click', () => {
        Editor.Message.send('framework-plugin', 'cancel-upload');
    });

    btnSelectAll!.addEventListener('click', () => {
        const checkboxes = treeContainer!.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach(cb => cb.checked = true);
    });

    btnDeselectAll!.addEventListener('click', () => {
        const checkboxes = treeContainer!.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach(cb => cb.checked = false);
    });
}

export function close() {
    treeContainer = null;
    progressContainer = null;
    progressBar = null;
    progressText = null;
    statusText = null;
    btnUpload = null;
    btnCancel = null;
    btnSelectAll = null;
    btnDeselectAll = null;
}

function getSelectedEntries(): Array<{ platform: string; bundleName: string; version: string }> {
    if (!treeContainer) return [];
    const checkboxes = treeContainer.querySelectorAll('input[type="checkbox"]:checked') as NodeListOf<HTMLInputElement>;
    const result: Array<{ platform: string; bundleName: string; version: string }> = [];
    checkboxes.forEach(cb => {
        const platform = cb.dataset.platform;
        const bundleName = cb.dataset.bundle;
        const version = cb.dataset.version;
        if (platform && bundleName && version) {
            result.push({ platform, bundleName, version });
        }
    });
    return result;
}

export const methods = {
    /**
     * 设置树形数据并渲染 checkbox
     * data 格式：{ platform: string, bundleName: string, version: string }[]
     */
    setTreeData(dataStr: string) {
        if (!treeContainer) return;
        try {
            const data: Array<{ platform: string; bundleName: string; version: string }> = JSON.parse(dataStr);

            // 按 platform 分组
            const grouped: Record<string, Array<{ bundleName: string; version: string }>> = {};
            for (const entry of data) {
                if (!grouped[entry.platform]) grouped[entry.platform] = [];
                grouped[entry.platform].push({ bundleName: entry.bundleName, version: entry.version });
            }

            let html = '';
            for (const [platform, bundles] of Object.entries(grouped)) {
                html += `<div class="tree-platform">`;
                html += `<div class="tree-platform-label">📁 ${platform}</div>`;
                for (const b of bundles) {
                    const id = `cb-${platform}-${b.bundleName}-${b.version}`;
                    html += `<div class="tree-bundle">`;
                    html += `<input type="checkbox" id="${id}" data-platform="${platform}" data-bundle="${b.bundleName}" data-version="${b.version}" checked>`;
                    html += `<label for="${id}">${b.bundleName} / <span style="color: #6a9955;">${b.version}</span></label>`;
                    html += `</div>`;
                }
                html += `</div>`;
            }

            treeContainer.innerHTML = html || '<div style="color: #888; padding: 20px; text-align: center;">未找到可上传的构建产物<br>请先执行构建</div>';
        } catch (e) {
            console.error('[Upload Panel] 树形数据解析失败', e);
        }
    },

    /**
     * 更新上传进度
     */
    updateProgress(dataStr: string) {
        if (!progressContainer || !progressBar || !progressText || !statusText) return;
        try {
            const data: { current: number; total: number; fileName: string; status: string } = JSON.parse(dataStr);


            const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${data.current} / ${data.total}`;

            const statusColors: Record<string, string> = {
                uploading: '#569cd6',
                success: '#4ec9b0',
                error: '#f44747',
                skipped: '#ce9178',
            };
            statusText.style.color = statusColors[data.status] || '#d4d4d4';

            // 添加日志
            const logEl = progressContainer.querySelector('#upload-log');
            if (logEl && data.fileName) {
                const icons: Record<string, string> = {
                    uploading: '⏳',
                    success: '✅',
                    error: '❌',
                    skipped: '⏭️',
                };
                const icon = icons[data.status] || '';
                const line = document.createElement('div');
                line.textContent = `${icon} ${data.fileName}`;
                line.style.color = statusColors[data.status] || '#888';
                logEl.appendChild(line);
                logEl.scrollTop = logEl.scrollHeight;
            }

            if (data.status === 'uploading') {
                statusText.textContent = `上传中: ${data.fileName}`;
            }
        } catch (e) {
            console.error('[Upload Panel] 进度数据解析失败', e);
        }
    },

    /**
     * 切换上传/选择模式
     */
    setUploading(isUploading: string) {
        const uploading = isUploading === 'true';
        if (btnUpload) btnUpload.style.display = uploading ? 'none' : 'block';
        if (btnCancel) btnCancel.style.display = uploading ? 'block' : 'none';
        if (btnSelectAll) btnSelectAll.style.display = uploading ? 'none' : 'inline-block';
        if (btnDeselectAll) btnDeselectAll.style.display = uploading ? 'none' : 'inline-block';

        if (uploading) {
            // 清空之前的日志
            const logEl = progressContainer?.querySelector('#upload-log');
            if (logEl) logEl.innerHTML = '';
            if (progressBar) {
                progressBar.style.width = '0%';
                progressBar.style.background = '#0e639c';
            }
            if (progressText) progressText.textContent = '上传中...';
            if (statusText) {
                statusText.textContent = '';
                statusText.style.color = '#6a9955';
            }
        }

        // 禁用/启用 checkbox
        if (treeContainer) {
            const checkboxes = treeContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
            checkboxes.forEach(cb => cb.disabled = uploading);
        }
    },

    /**
     * 设置完成状态
     */
    setComplete(message: string) {
        if (progressText) {
            progressText.textContent = '✅ 全部上传完成';
            progressText.style.color = '#4ec9b0';
        }
        if (statusText) {
            statusText.textContent = message;
            statusText.style.color = '#4ec9b0';
        }
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.style.background = '#4ec9b0';
        }
        // 恢复按钮
        if (btnUpload) btnUpload.style.display = 'block';
        if (btnCancel) btnCancel.style.display = 'none';
        if (btnSelectAll) btnSelectAll.style.display = 'inline-block';
        if (btnDeselectAll) btnDeselectAll.style.display = 'inline-block';
        if (treeContainer) {
            const checkboxes = treeContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
            checkboxes.forEach(cb => cb.disabled = false);
        }
    },

    /**
     * 设置错误状态
     */
    setError(message: string) {
        if (statusText) {
            statusText.textContent = message;
            statusText.style.color = '#f44747';
        }
        if (progressBar) {
            progressBar.style.background = '#f44747';
        }
        if (btnUpload) btnUpload.style.display = 'block';
        if (btnCancel) btnCancel.style.display = 'none';
        if (treeContainer) {
            const checkboxes = treeContainer.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
            checkboxes.forEach(cb => cb.disabled = false);
        }
    },
};
