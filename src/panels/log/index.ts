/**
 * 框架管理 - 日志面板
 * 实时显示框架操作的执行日志，置顶显示
 */

const logLines: Array<{ time: string; type: string; message: string }> = [];
let logContainer: HTMLElement | null = null;

export const template = `
<div id="log-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6;">📋 框架管理 - 运行日志</span>
        <button id="btn-clear" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;">清空</button>
    </div>
    <div id="log-container" style="flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 1.6;"></div>
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
`;

export const $ = {
    'log-container': '#log-container',
    'btn-clear': '#btn-clear',
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
    const btnClear = this.$['btn-clear'] as HTMLElement;

    // 清空按钮
    btnClear.addEventListener('click', () => {
        logLines.length = 0;
        if (logContainer) {
            logContainer.innerHTML = '<div style="color: #6a9955; padding: 4px 0;">日志已清空</div>';
        }
    });

    // 渲染已有日志
    if (logContainer && logLines.length > 0) {
        logContainer.innerHTML = logLines.map(renderLog).join('');
        logContainer.scrollTop = logContainer.scrollHeight;
    } else if (logContainer) {
        logContainer.innerHTML = '<div style="color: #6a9955; padding: 4px 0;">等待操作...</div>';
    }
}

export function close() {
    logContainer = null;
}

export const methods = {
    /**
     * 追加日志（由 main.ts 通过消息调用）
     */
    appendLog(dataStr: string) {
        try {
            const entry = JSON.parse(dataStr);
            logLines.push(entry);

            // 限制日志行数
            if (logLines.length > 500) {
                logLines.splice(0, logLines.length - 500);
            }

            if (logContainer) {
                // 追加新日志行
                const div = document.createElement('div');
                div.innerHTML = renderLog(entry);
                logContainer.appendChild(div.firstElementChild as HTMLElement);

                // 自动滚动到底部
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        } catch (e) {
            console.error('[框架管理] 日志解析失败', e);
        }
    },
};
