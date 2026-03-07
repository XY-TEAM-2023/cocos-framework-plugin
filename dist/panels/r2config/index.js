"use strict";
/**
 * R2 配置面板
 *
 * 提供 4 个输入框 + 提示文本 + 测试连接按钮 + 保存按钮
 * 只有测试连接成功后才能保存
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.close = exports.ready = exports.$ = exports.style = exports.template = void 0;
let inputAccountId = null;
let inputAccessKeyId = null;
let inputSecretAccessKey = null;
let inputBucketName = null;
let statusEl = null;
let btnSaveEl = null;
let connectionVerified = false;
exports.template = `
<div id="r2-config-panel" style="display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;">
    <!-- Header -->
    <div style="padding: 12px 16px; background: #2d2d2d; border-bottom: 1px solid #404040;">
        <span style="font-weight: bold; color: #569cd6; font-size: 14px;">☁️ 配置 R2</span>
    </div>

    <!-- Form -->
    <div style="flex: 1; overflow-y: auto; padding: 16px;">
        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;">Cloudflare Account ID</label>
            <input id="input-account-id" type="text" placeholder="输入 Account ID" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;">
            <div style="margin-top: 3px; font-size: 11px; color: #666;">Cloudflare 控制台首页 → 右侧栏「Account ID」</div>
        </div>

        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;">Access Key ID</label>
            <input id="input-access-key-id" type="text" placeholder="输入 Access Key ID" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;">
            <div style="margin-top: 3px; font-size: 11px; color: #666;">创建 API 令牌后页面「为 S3 客户端使用以下凭据」→「访问密钥 ID」</div>
        </div>

        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;">Secret Access Key</label>
            <input id="input-secret-access-key" type="password" placeholder="输入 Secret Access Key" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;">
            <div style="margin-top: 3px; font-size: 11px; color: #666;">同上页面「为 S3 客户端使用以下凭据」→「机密访问密钥」，仅显示一次</div>
        </div>

        <div style="margin-bottom: 14px;">
            <label style="display: block; margin-bottom: 4px; color: #9cdcfe; font-size: 12px;">Bucket 名称</label>
            <input id="input-bucket-name" type="text" placeholder="输入 Bucket Name" style="width: 100%; box-sizing: border-box; background: #3c3c3c; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 8px 10px; font-size: 13px; outline: none;">
            <div style="margin-top: 3px; font-size: 11px; color: #666;">R2 → 概述 → 选择已创建的存储桶名称</div>
        </div>

        <div id="status-text" style="min-height: 20px; font-size: 12px; color: #888; padding: 4px 0;"></div>
    </div>

    <!-- Buttons -->
    <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; background: #2d2d2d; border-top: 1px solid #404040;">
        <button id="btn-test" style="background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px;">测试连接</button>
        <button id="btn-save" style="background: #555; color: #888; border: none; border-radius: 4px; padding: 6px 16px; cursor: not-allowed; font-size: 12px;" disabled>保存</button>
    </div>
</div>
`;
exports.style = `
#r2-config-panel input:focus {
    border-color: #0e639c !important;
}
#r2-config-panel button:hover:not(:disabled) {
    opacity: 0.9;
}
`;
exports.$ = {
    'input-account-id': '#input-account-id',
    'input-access-key-id': '#input-access-key-id',
    'input-secret-access-key': '#input-secret-access-key',
    'input-bucket-name': '#input-bucket-name',
    'btn-test': '#btn-test',
    'btn-save': '#btn-save',
    'status-text': '#status-text',
};
function enableSaveButton() {
    if (btnSaveEl) {
        btnSaveEl.style.background = '#0e639c';
        btnSaveEl.style.color = '#fff';
        btnSaveEl.style.cursor = 'pointer';
        btnSaveEl.disabled = false;
    }
}
function disableSaveButton() {
    if (btnSaveEl) {
        btnSaveEl.style.background = '#555';
        btnSaveEl.style.color = '#888';
        btnSaveEl.style.cursor = 'not-allowed';
        btnSaveEl.disabled = true;
    }
}
function ready() {
    inputAccountId = this.$['input-account-id'];
    inputAccessKeyId = this.$['input-access-key-id'];
    inputSecretAccessKey = this.$['input-secret-access-key'];
    inputBucketName = this.$['input-bucket-name'];
    statusEl = this.$['status-text'];
    btnSaveEl = this.$['btn-save'];
    const btnTest = this.$['btn-test'];
    // 输入内容变化时重置连接验证状态
    const resetVerification = () => {
        connectionVerified = false;
        disableSaveButton();
        setStatus('', '#888');
    };
    inputAccountId.addEventListener('input', resetVerification);
    inputAccessKeyId.addEventListener('input', resetVerification);
    inputSecretAccessKey.addEventListener('input', resetVerification);
    inputBucketName.addEventListener('input', resetVerification);
    btnTest.addEventListener('click', () => {
        setStatus('正在测试连接...', '#569cd6');
        const config = getFormValues();
        Editor.Message.send('framework-plugin', 'test-r2-connection', JSON.stringify(config));
    });
    btnSaveEl.addEventListener('click', () => {
        if (!connectionVerified) {
            setStatus('⚠️ 请先测试连接', '#ce9178');
            return;
        }
        const config = getFormValues();
        Editor.Message.send('framework-plugin', 'save-r2-config', JSON.stringify(config));
    });
}
exports.ready = ready;
function close() {
    inputAccountId = null;
    inputAccessKeyId = null;
    inputSecretAccessKey = null;
    inputBucketName = null;
    statusEl = null;
    btnSaveEl = null;
    connectionVerified = false;
}
exports.close = close;
function getFormValues() {
    var _a, _b, _c, _d;
    return {
        accountId: ((_a = inputAccountId === null || inputAccountId === void 0 ? void 0 : inputAccountId.value) === null || _a === void 0 ? void 0 : _a.trim()) || '',
        accessKeyId: ((_b = inputAccessKeyId === null || inputAccessKeyId === void 0 ? void 0 : inputAccessKeyId.value) === null || _b === void 0 ? void 0 : _b.trim()) || '',
        secretAccessKey: ((_c = inputSecretAccessKey === null || inputSecretAccessKey === void 0 ? void 0 : inputSecretAccessKey.value) === null || _c === void 0 ? void 0 : _c.trim()) || '',
        bucketName: ((_d = inputBucketName === null || inputBucketName === void 0 ? void 0 : inputBucketName.value) === null || _d === void 0 ? void 0 : _d.trim()) || '',
    };
}
function setStatus(text, color) {
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    }
}
exports.methods = {
    /**
     * 填充现有配置
     */
    loadConfig(configStr) {
        try {
            const config = JSON.parse(configStr);
            if (inputAccountId)
                inputAccountId.value = config.accountId || '';
            if (inputAccessKeyId)
                inputAccessKeyId.value = config.accessKeyId || '';
            if (inputSecretAccessKey)
                inputSecretAccessKey.value = config.secretAccessKey || '';
            if (inputBucketName)
                inputBucketName.value = config.bucketName || '';
            connectionVerified = false;
            disableSaveButton();
        }
        catch (e) {
            console.error('[R2 Config] 加载配置失败', e);
        }
    },
    /**
     * 设置状态文字（含连接验证结果）
     */
    setStatus(dataStr) {
        try {
            const { text, color, verified } = JSON.parse(dataStr);
            setStatus(text, color);
            if (verified === true) {
                connectionVerified = true;
                enableSaveButton();
            }
            else if (verified === false) {
                connectionVerified = false;
                disableSaveButton();
            }
        }
        catch (e) {
            console.error('[R2 Config] 状态设置失败', e);
        }
    },
};
//# sourceMappingURL=index.js.map