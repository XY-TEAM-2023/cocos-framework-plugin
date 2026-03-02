"use strict";
/**
 * 框架管理 - 日志面板
 * 实时显示框架操作的执行日志，置顶显示
 * 支持提交信息输入（多行 textarea）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
const logLines = [];
let logContainer = null;
let commitInputArea = null;
let commitInput = null;
let currentTarget = '';
exports.template = `
<div id="log-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;">
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6;">📋 框架管理 - 运行日志</span>
        <button id="btn-copy" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-size: 11px;">复制</button>
    </div>
    <div id="log-container" style="flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 1.6;"></div>
    <div id="commit-input-area" style="display: none; padding: 8px 12px; background: #2d2d2d; border-top: 1px solid #404040;">
        <div id="input-label" style="margin-bottom: 6px; color: #569cd6; font-weight: bold;">📝 提交信息：</div>
        <textarea id="commit-input" rows="3" placeholder="请输入提交信息..." style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 6px 10px; font-size: 12px; outline: none; font-family: 'Courier New', monospace; resize: vertical;"></textarea>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
            <button id="btn-cancel" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 6px 12px; cursor: pointer; font-size: 12px;">取消</button>
            <button id="btn-commit" style="background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 6px 16px; cursor: pointer; font-size: 12px;">推送</button>
        </div>
    </div>
</div>
`;
exports.style = `
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
exports.$ = {
    'log-container': '#log-container',
    'btn-copy': '#btn-copy',
    'commit-input-area': '#commit-input-area',
    'commit-input': '#commit-input',
    'btn-commit': '#btn-commit',
    'btn-cancel': '#btn-cancel',
    'input-label': '#input-label',
};
function getColorForType(type) {
    switch (type) {
        case 'success': return '#4ec9b0';
        case 'warn': return '#ce9178';
        case 'error': return '#f44747';
        default: return '#d4d4d4';
    }
}
function getPrefixForType(type) {
    switch (type) {
        case 'success': return '✅';
        case 'warn': return '⚠️';
        case 'error': return '❌';
        default: return 'ℹ️';
    }
}
function renderLog(entry) {
    const color = getColorForType(entry.type);
    const prefix = getPrefixForType(entry.type);
    const timeColor = '#6a9955';
    return `<div style="padding: 1px 0; border-bottom: 1px solid #2a2a2a;">
        <span style="color: ${timeColor};">[${entry.time}]</span>
        <span style="color: ${color};"> ${prefix} ${entry.message}</span>
    </div>`;
}
function ready() {
    logContainer = this.$['log-container'];
    commitInputArea = this.$['commit-input-area'];
    commitInput = this.$['commit-input'];
    const btnCopy = this.$['btn-copy'];
    const btnCommit = this.$['btn-commit'];
    const btnCancel = this.$['btn-cancel'];
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
    // 推送/切换按钮
    btnCommit.addEventListener('click', () => {
        var _a;
        const msg = ((_a = commitInput === null || commitInput === void 0 ? void 0 : commitInput.value) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        if (!msg) {
            if (commitInput)
                commitInput.style.borderColor = '#f44747';
            return;
        }
        if (commitInputArea)
            commitInputArea.style.display = 'none';
        if (currentTarget === 'framework') {
            Editor.Message.send('framework-plugin', 'do-publish-framework', msg);
        }
        else if (currentTarget === 'plugin') {
            Editor.Message.send('framework-plugin', 'do-publish-plugin', msg);
        }
        else if (currentTarget === 'switch-version') {
            Editor.Message.send('framework-plugin', 'do-switch-version', msg);
        }
        currentTarget = '';
    });
    // 取消按钮
    btnCancel.addEventListener('click', () => {
        if (commitInputArea)
            commitInputArea.style.display = 'none';
        currentTarget = '';
    });
    // textarea 输入时清除红色边框
    if (commitInput) {
        commitInput.addEventListener('input', () => {
            if (commitInput)
                commitInput.style.borderColor = '#555';
        });
    }
    // 渲染已有日志
    if (logContainer && logLines.length > 0) {
        logContainer.innerHTML = logLines.map(renderLog).join('');
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}
exports.ready = ready;
function close() {
    logContainer = null;
    commitInputArea = null;
    commitInput = null;
}
exports.close = close;
exports.methods = {
    appendLog(dataStr) {
        try {
            const entry = JSON.parse(dataStr);
            logLines.push(entry);
            if (logLines.length > 500) {
                logLines.splice(0, logLines.length - 500);
            }
            if (logContainer) {
                const div = document.createElement('div');
                div.innerHTML = renderLog(entry);
                logContainer.appendChild(div.firstElementChild);
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }
        catch (e) {
            console.error('[框架管理] 日志解析失败', e);
        }
    },
    showCommitInput(target) {
        currentTarget = target;
        const label = commitInputArea === null || commitInputArea === void 0 ? void 0 : commitInputArea.querySelector('#input-label');
        if (label)
            label.textContent = '📝 提交信息：';
        if (commitInputArea)
            commitInputArea.style.display = 'block';
        if (commitInput) {
            commitInput.value = '';
            commitInput.rows = 3;
            commitInput.placeholder = '请输入提交信息（支持多行）...';
            commitInput.style.borderColor = '#555';
            commitInput.focus();
        }
        const btnCommit = commitInputArea === null || commitInputArea === void 0 ? void 0 : commitInputArea.querySelector('#btn-commit');
        if (btnCommit)
            btnCommit.textContent = '推送';
    },
    showHashInput() {
        currentTarget = 'switch-version';
        const label = commitInputArea === null || commitInputArea === void 0 ? void 0 : commitInputArea.querySelector('#input-label');
        if (label)
            label.textContent = '🔀 输入 commit hash：';
        if (commitInputArea)
            commitInputArea.style.display = 'block';
        if (commitInput) {
            commitInput.value = '';
            commitInput.rows = 1;
            commitInput.placeholder = '请输入 commit hash（7位短hash）...';
            commitInput.style.borderColor = '#555';
            commitInput.focus();
        }
        const btnCommit = commitInputArea === null || commitInputArea === void 0 ? void 0 : commitInputArea.querySelector('#btn-commit');
        if (btnCommit)
            btnCommit.textContent = '切换';
    },
};
//# sourceMappingURL=index.js.map