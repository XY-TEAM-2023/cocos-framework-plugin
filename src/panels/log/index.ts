/**
 * 框架管理 - 日志面板
 * 实时显示框架操作的执行日志，置顶显示
 * 支持提交信息输入
 */

const logLines: Array<{ time: string; type: string; message: string }> = [];
let logContainer: HTMLElement | null = null;
let commitInputArea: HTMLElement | null = null;
let commitInput: HTMLInputElement | null = null;
let currentTarget: string = '';

export const template = `
<div id="log-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6;">📋 框架管理 - 运行日志</span>
        <button id="btn-copy" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;">复制</button>
    </div>
    <div id="log-container" style="flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 1.6;"></div>
    <div id="commit-input-area" style="display: none; padding: 8px 12px; background: #2d2d2d; border-top: 1px solid #404040;">
        <div style="margin-bottom: 6px; color: #569cd6; font-weight: bold;">📝 提交信息：</div>
        <div style="display: flex; gap: 8px;">
            <input id="commit-input" type="text" placeholder="请输入提交信息..." style="flex: 1; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 6px 10px; font-size: 12px; outline: none; font-family: 'Courier New', monospace;" />
            <button id="btn-commit" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 6px 16px; cursor: pointer; font-size: 12px; white-space: nowrap;">推送</button>
            <button id="btn-cancel" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 6px 12px; cursor: pointer; font-size: 12px; white-space: nowrap;">取消</button>
        </div>
    </div>
</div>
`;

export const style = `
#log-panel ::-webkit-scrollbar {
    width: 8px;
}
#log-panel ::-webkit-scrollbar-track {
    background: #1e1e1e;
}
#log-panel ::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
}
#log-panel ::-webkit-scrollbar-thumb:hover {
    background: #777;
}
#commit-input:focus {
    border-color: #0e639c !important;
}
`;

export const $ = {
    'log-container': '#log-container',
    'btn-copy': '#btn-copy',
    'commit-input-area': '#commit-input-area',
    'commit-input': '#commit-input',
    'btn-commit': '#btn-commit',
    'btn-cancel': '#btn-cancel',
};

function getColorForType(type: string): string {
    switch (type) {
        case 'success': return '#4ec9b0';
        case 'warn': return '#ce9178';
        case 'error': return '#f44747';
        default: return '#d4d4d4';
    }
}

function getPrefixForType(type: string): string {
    switch (type) {
        case 'success': return '✅';
        case 'warn': return '⚠️';
        case 'error': return '❌';
        default: return 'ℹ️';
    }
}

function renderLog(entry: { time: string; type: string; message: string }): string {
    const color = getColorForType(entry.type);
    const prefix = getPrefixForType(entry.type);
    const timeColor = '#6a9955';
    return `<div style="padding: 1px 0; border-bottom: 1px solid #2a2a2a;">
        <span style="color: ${timeColor};">[${entry.time}]</span>
        <span style="color: ${color};"> ${prefix} ${entry.message}</span>
    </div>`;
}

export function ready(this: any) {
    logContainer = this.$['log-container'] as HTMLElement;
    commitInputArea = this.$['commit-input-area'] as HTMLElement;
    commitInput = this.$['commit-input'] as HTMLInputElement;
    const btnCopy = this.$['btn-copy'] as HTMLElement;
    const btnCommit = this.$['btn-commit'] as HTMLElement;
    const btnCancel = this.$['btn-cancel'] as HTMLElement;

    // 复制按钮
    btnCopy.addEventListener('click', () => {
        const text = logLines.map(e => `[${e.time}] ${getPrefixForType(e.type)} ${e.message}`).join('\n');
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                btnCopy.textContent = '已复制 ✅';
                setTimeout(() => { btnCopy.textContent = '复制'; }, 1500);
            });
        }
    });

    // 推送按钮
    btnCommit.addEventListener('click', () => {
        const msg = commitInput?.value?.trim() || '';
        if (!msg) {
            if (commitInput) commitInput.style.borderColor = '#f44747';
            return;
        }
        if (commitInputArea) commitInputArea.style.display = 'none';

        if (currentTarget === 'framework') {
            Editor.Message.send('framework-plugin', 'do-publish-framework', msg);
        } else if (currentTarget === 'plugin') {
            Editor.Message.send('framework-plugin', 'do-publish-plugin', msg);
        } else if (currentTarget === 'switch-version') {
            Editor.Message.send('framework-plugin', 'do-switch-version', msg);
        }
        currentTarget = '';
    });

    // 取消按钮
    btnCancel.addEventListener('click', () => {
        if (commitInputArea) commitInputArea.style.display = 'none';
        currentTarget = '';
    });

    // 输入框回车
    if (commitInput) {
        commitInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (commitInput) commitInput.style.borderColor = '#555';
            if (e.key === 'Enter') {
                btnCommit.click();
            }
        });
    }

    // 渲染已有日志
    if (logContainer && logLines.length > 0) {
        logContainer.innerHTML = logLines.map(renderLog).join('');
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

export function close() {
    logContainer = null;
    commitInputArea = null;
    commitInput = null;
}

export const methods = {
    /**
     * 追加日志
     */
    appendLog(dataStr: string) {
        try {
            const entry = JSON.parse(dataStr);
            logLines.push(entry);

            if (logLines.length > 500) {
                logLines.splice(0, logLines.length - 500);
            }

            if (logContainer) {
                const div = document.createElement('div');
                div.innerHTML = renderLog(entry);
                logContainer.appendChild(div.firstElementChild as HTMLElement);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        } catch (e) {
            console.error('[框架管理] 日志解析失败', e);
        }
    },

    /**
     * 显示提交信息输入框
     */
    showCommitInput(target: string) {
        currentTarget = target;
        if (commitInputArea) {
            commitInputArea.style.display = 'block';
        }
        if (commitInput) {
            commitInput.value = '';
            commitInput.placeholder = '请输入提交信息...';
            commitInput.style.borderColor = '#555';
            commitInput.focus();
        }
        // 更新按钮文本
        const btnCommit = commitInputArea?.querySelector('#btn-commit') as HTMLElement;
        if (btnCommit) btnCommit.textContent = '推送';
    },

    /**
     * 显示 hash 输入框（切换版本用）
     */
    showHashInput() {
        currentTarget = 'switch-version';
        if (commitInputArea) {
            commitInputArea.style.display = 'block';
        }
        if (commitInput) {
            commitInput.value = '';
            commitInput.placeholder = '请输入 commit hash（7位短hash）...';
            commitInput.style.borderColor = '#555';
            commitInput.focus();
        }
        // 更新按钮文本
        const btnCommit = commitInputArea?.querySelector('#btn-commit') as HTMLElement;
        if (btnCommit) btnCommit.textContent = '切换';
    },
};
