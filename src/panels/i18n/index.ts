/**
 * 国际化资源编辑面板
 *
 * 三栏布局：命名空间列表 | Key 列表 | 翻译编辑区
 * 基于 Stitch 设计稿实现，暗色主题
 */

// ==================== 类型 ====================

interface SourceInfo {
    name: string;
    filePath: string;
    namespaces: string[];
}

interface SourceFullData {
    name: string;
    data: Record<string, Record<string, Record<string, string>>>;
}

interface I18nPayload {
    sources: SourceInfo[];
    languages: string[];
    primaryLang: string;
    fullData: SourceFullData[];
    refCounts?: Record<string, number>;
}

interface AvailableGame {
    name: string;
    targetPath?: string;
    relativePath: string;
}

// ==================== 状态 ====================

let panelRef: any = null;

/** 完整数据 */
let payload: I18nPayload | null = null;

/** 当前选中的数据源索引 */
let selectedSourceIndex = 0;

/** 当前选中的命名空间 */
let selectedNamespace = '';

/** 当前选中的 Key */
let selectedKey = '';

/** Key 列表搜索关键字 */
let searchKeyword = '';

/** 正在重命名的命名空间 */
let renamingNs = '';

/** 可添加 i18n 的游戏列表（弹窗使用） */
let availableGames: AvailableGame[] = [];

/** 等待自动切换到的数据源名称（添加后跳转） */
let pendingSwitchSource = '';

/** 当前编辑 Key 的原始翻译快照（用于脏检测） */
let originalTranslations: Record<string, string> = {};

/** 是否处于选择模式（从 Inspector 打开，选中 key 后回传） */
let pickMode = false;

// ==================== 模板 ====================

export const template = `
<div id="i18n-panel">
    <!-- 顶部工具栏 -->
    <div id="toolbar">
        <div id="toolbar-left">
            <span class="toolbar-title">国际化资源管理</span>
        </div>
        <div id="toolbar-right">
            <button id="btn-ai-config" class="tool-btn" title="配置 AI 翻译供应商">配置AI翻译服务</button>
            <button id="btn-lang-manage" class="tool-btn" title="语言管理">语言管理</button>
        </div>
    </div>

    <!-- 语言管理弹窗 -->
    <div id="lang-manage-overlay" class="overlay hidden">
        <div class="overlay-dialog">
            <div class="dialog-header">
                <span>语言管理</span>
                <button id="btn-close-lang-dialog" class="dialog-close">✕</button>
            </div>
            <div class="dialog-hint">管理项目中使用的语言，删除语言将清除所有数据源中该语言的翻译内容</div>
            <div id="lang-list" class="dialog-body"></div>
            <div class="dialog-footer">
                <input id="new-lang-input" type="text" placeholder="输入语言代码（如 ko、fr）" class="dialog-input">
                <button id="btn-add-new-lang" class="dialog-add-btn">添加</button>
            </div>
        </div>
    </div>

    <!-- 添加数据源弹窗 -->
    <div id="add-source-overlay" class="overlay hidden">
        <div class="overlay-dialog">
            <div class="dialog-header">
                <span>添加国际化数据源</span>
                <button id="btn-close-dialog" class="dialog-close">✕</button>
            </div>
            <div class="dialog-hint">选择 Bundle 目录，将自动创建 i18n/i18n.json 文件并切换到该数据源</div>
            <div id="available-games-list" class="dialog-body"></div>
        </div>
    </div>

    <!-- AI 翻译供应商配置弹窗 -->
    <div id="ai-config-overlay" class="overlay hidden">
        <div class="overlay-dialog ai-config-dialog">
            <div class="dialog-header">
                <span>配置 AI 翻译供应商</span>
                <button id="btn-close-ai-dialog" class="dialog-close">✕</button>
            </div>
            <div class="dialog-hint">使用 OpenAI 兼容协议（/v1/models、/v1/chat/completions），适用于 OpenAI / DeepSeek / 硅基流动 / Moonshot / 智谱 / 通义 / 本地 Ollama 等</div>
            <div class="ai-config-body">
                <div class="ai-field">
                    <label class="ai-field-label">供应商地址 (Base URL)</label>
                    <input id="ai-base-url" type="text" class="ai-input" placeholder="如 https://api.openai.com/v1">
                    <div class="ai-field-hint">不要带尾部斜杠，必须含 /v1（或同等版本路径）</div>
                </div>
                <div class="ai-field">
                    <label class="ai-field-label">API Key</label>
                    <input id="ai-api-key" type="password" class="ai-input" placeholder="sk-...">
                    <div class="ai-field-hint">本地保存到项目根 .ai-translate-config.json，自动加入 .gitignore</div>
                </div>
                <div class="ai-field">
                    <label class="ai-field-label">模型</label>
                    <div class="ai-model-row">
                        <select id="ai-model-select" class="ai-input ai-select">
                            <option value="">— 请先拉取模型列表 —</option>
                        </select>
                        <button id="btn-fetch-models" class="ai-fetch-btn">拉取模型列表</button>
                    </div>
                    <div id="ai-model-status" class="ai-field-hint"></div>
                </div>
                <div class="ai-field">
                    <label class="ai-field-label">翻译提示词</label>
                    <textarea id="ai-prompt" class="ai-input ai-textarea" rows="8" placeholder="提示词模板..."></textarea>
                    <div class="ai-field-hint">支持占位符：{sourceLang} 源语言, {targetLang} 目标语言, {text} 待翻译文本</div>
                </div>
                <div class="ai-field-row">
                    <div class="ai-field" style="flex:1;">
                        <label class="ai-field-label">超时（秒）</label>
                        <input id="ai-timeout-sec" type="number" min="5" max="600" step="5" class="ai-input" placeholder="60">
                        <div class="ai-field-hint">单次请求最长等待，默认 60s</div>
                    </div>
                    <div class="ai-field" style="flex:1;">
                        <label class="ai-field-label">失败重试次数</label>
                        <input id="ai-retries" type="number" min="0" max="5" step="1" class="ai-input" placeholder="0">
                        <div class="ai-field-hint">网络错误/HTTP 错误后再试 N 次（取消不会重试）</div>
                    </div>
                </div>
                <div class="ai-field">
                    <button id="btn-test-connection" class="ai-fetch-btn" style="align-self:flex-start;">🔌 测试连接</button>
                    <div id="ai-test-status" class="ai-field-hint"></div>
                </div>
            </div>
            <div class="dialog-footer ai-config-footer">
                <div class="actions-spacer"></div>
                <button id="btn-cancel-ai-config" class="action-btn ghost">取消</button>
                <button id="btn-save-ai-config" class="action-btn primary">保存</button>
            </div>
        </div>
    </div>

    <!-- 覆盖确认弹窗 -->
    <div id="overwrite-confirm-overlay" class="overlay hidden">
        <div class="overlay-dialog overwrite-confirm-dialog">
            <div class="dialog-header">
                <span>确认覆盖已有翻译</span>
                <button id="btn-close-overwrite-dialog" class="dialog-close">✕</button>
            </div>
            <div class="dialog-hint" id="overwrite-confirm-hint">检测到部分目标语言已有翻译，是否覆盖？</div>
            <div class="dialog-footer">
                <div class="actions-spacer"></div>
                <button id="btn-overwrite-cancel" class="action-btn ghost">取消</button>
                <button id="btn-overwrite-skip" class="action-btn ghost">仅填空白</button>
                <button id="btn-overwrite-all" class="action-btn primary">覆盖全部</button>
            </div>
        </div>
    </div>

    <!-- AI 调整描述弹窗 -->
    <div id="adjust-overlay" class="overlay hidden">
        <div class="overlay-dialog adjust-dialog">
            <div class="dialog-header">
                <span id="adjust-dialog-title">调整翻译</span>
                <button id="btn-close-adjust-dialog" class="dialog-close">✕</button>
            </div>
            <div class="dialog-hint">基于当前译文 + 你的补充描述，AI 会重新生成这条翻译</div>
            <div class="ai-config-body">
                <div class="ai-field">
                    <label class="ai-field-label">当前译文</label>
                    <div id="adjust-current-text" class="adjust-current-text"></div>
                </div>
                <div class="ai-field">
                    <label class="ai-field-label">补充描述</label>
                    <textarea id="adjust-instruction" class="ai-input ai-textarea" rows="4" placeholder="例：再短一点 / 换种说法 / 更口语化 / 加上感叹号"></textarea>
                </div>
            </div>
            <div class="dialog-footer ai-config-footer">
                <div class="actions-spacer"></div>
                <button id="btn-adjust-cancel" class="action-btn ghost">取消</button>
                <button id="btn-adjust-submit" class="action-btn primary">重新生成</button>
            </div>
        </div>
    </div>

    <!-- 内容区 -->
    <div id="content-area">
        <!-- 最左栏：配置文件 -->
        <div id="col-source">
            <div class="col-header">
                <span>配置文件</span>
                <div class="col-header-actions">
                    <button id="btn-add-source" class="col-header-btn" title="为 Bundle 添加国际化数据源">+</button>
                    <button id="btn-remove-source" class="col-header-btn danger" title="移除当前数据源">−</button>
                </div>
            </div>
            <div id="source-list" class="col-body"></div>
        </div>

        <!-- 左栏：命名空间 -->
        <div id="col-ns">
            <div class="col-header">
                <span>命名空间</span>
                <button id="btn-add-ns" class="col-header-btn" title="新建命名空间">+</button>
            </div>
            <div id="ns-list" class="col-body"></div>
            <div id="ns-footer">
                <button id="btn-rename-ns" class="ns-footer-btn" disabled title="重命名命名空间">✎ 重命名</button>
                <button id="btn-delete-ns" class="ns-footer-btn danger" disabled title="删除命名空间">✕ 删除</button>
            </div>
        </div>

        <!-- 中栏：Key 列表 -->
        <div id="col-keys">
            <div class="col-header">
                <input id="key-search" type="text" placeholder="搜索 Key..." class="search-input">
                <button id="btn-add-key" class="col-header-btn" title="新建 Key">+</button>
            </div>
            <div id="key-list" class="col-body"></div>
            <div id="key-list-footer">
                <button id="btn-rescan-refs" class="key-footer-btn" title="重新扫描项目中的引用次数">↻ 刷新引用统计</button>
            </div>
        </div>

        <!-- 右栏：翻译编辑 -->
        <div id="col-edit">
            <div id="edit-header">
                <span id="edit-key-path">选择一个 Key 进行编辑</span>
                <button id="btn-copy-key" class="edit-copy-btn hidden" title="复制 Key 路径">复制</button>
            </div>
            <div id="var-hint-bar" class="hidden"></div>
            <div id="edit-body" class="col-body"></div>
            <div id="edit-actions">
                <button id="btn-delete-key" class="action-btn danger" disabled>删除 Key</button>
                <div class="actions-spacer"></div>
                <button id="btn-cancel-key" class="action-btn ghost" disabled>取消</button>
                <button id="btn-save-key" class="action-btn primary" disabled>保存</button>
            </div>
        </div>
    </div>

    <!-- AI 翻译进行中浮条（右下角） -->
    <div id="ai-cancel-bar" class="ai-cancel-bar hidden">
        <span id="ai-cancel-text">正在调用 AI...</span>
        <button id="btn-cancel-ai" class="ai-cancel-btn">取消</button>
    </div>

    <!-- 选择模式操作条（覆盖在底部状态栏上方） -->
    <div id="pick-mode-bar" class="pick-mode-bar hidden">
        <span id="pick-mode-hint">🎯 请选择一个 Key</span>
        <div class="pick-mode-actions">
            <button id="btn-cancel-pick" class="pick-cancel-btn">取消</button>
            <button id="btn-confirm-pick" class="pick-confirm-btn" disabled>选择</button>
        </div>
    </div>

    <!-- 底部状态栏 -->
    <div id="status-bar">
        <span id="status-text">就绪</span>
    </div>
</div>
`;

export const style = `
/* 全局 */
#i18n-panel {
    display: flex; flex-direction: column; height: 100%;
    background: #0D0D0D; color: #d4d4d4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px;
    position: relative;
}

/* 顶部工具栏 */
#toolbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
    min-height: 40px;
}
#toolbar-left { display: flex; align-items: center; gap: 12px; }
#toolbar-right { display: flex; align-items: center; gap: 6px; }
.toolbar-title { font-size: 14px; font-weight: 600; color: #e0e0e0; }

.tool-btn {
    background: #2a2a2a; color: #d4d4d4; border: 1px solid #404040;
    border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.tool-btn:hover { background: #3a3a3a; }

/* 添加数据源弹窗 */
/* 通用弹窗遮罩 */
.overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.6); z-index: 100;
    display: flex; align-items: center; justify-content: center;
}
.overlay.hidden { display: none; }
.overlay-dialog {
    background: #1e1e1e; border: 1px solid #404040; border-radius: 8px;
    width: 500px; max-height: 80%; display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

/* 语言管理弹窗 */
.lang-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 18px; border-bottom: 1px solid #1a1a1a;
}
.lang-item:hover { background: #252525; }
.lang-item-info { display: flex; align-items: center; gap: 8px; }
.lang-item-code { font-size: 14px; color: #d4d4d4; font-weight: 600; }
.lang-item-badge { font-size: 10px; color: #007ACC; background: #1a2a3a; border-radius: 3px; padding: 1px 6px; }
.lang-item-actions { display: flex; gap: 6px; }
.lang-set-primary {
    background: none; border: 1px solid #2a3a2a; color: #6a6; border-radius: 4px;
    padding: 2px 8px; font-size: 11px; cursor: pointer;
}
.lang-set-primary:hover { background: #1a3a1a; color: #4c4; border-color: #3a5a3a; }
.lang-item-delete {
    background: none; border: 1px solid #3a2a2a; color: #a66; border-radius: 4px;
    padding: 3px 10px; font-size: 11px; cursor: pointer;
}
.lang-item-delete:hover { background: #3a1a1a; color: #f66; border-color: #5a2a2a; }
.lang-item-delete:disabled { opacity: 0.3; cursor: not-allowed; }
.dialog-footer {
    display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid #2a2a2a;
}
.dialog-input {
    flex: 1; background: #2a2a2a; border: 1px solid #404040; color: #d4d4d4;
    border-radius: 4px; padding: 6px 10px; font-size: 13px; outline: none;
}
.dialog-input:focus { border-color: #007ACC; }
.dialog-add-btn {
    background: #007ACC; color: #fff; border: none; border-radius: 4px;
    padding: 6px 16px; font-size: 13px; cursor: pointer;
}
.dialog-add-btn:hover { background: #0098ff; }
.dialog-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid #2a2a2a;
}
.dialog-header span { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.dialog-close {
    background: none; border: none; color: #666; cursor: pointer; font-size: 16px;
    width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
}
.dialog-close:hover { background: #333; color: #fff; }
.dialog-hint {
    padding: 10px 18px; font-size: 12px; color: #888; border-bottom: 1px solid #1a1a1a;
}
.dialog-body { flex: 1; overflow-y: auto; padding: 8px 0; }
.game-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 18px; cursor: pointer; transition: background 0.1s;
}
.game-item:hover { background: #252525; }
.game-item-info { display: flex; flex-direction: column; gap: 3px; }
.game-item-name { font-size: 14px; color: #d4d4d4; font-weight: 500; }
.game-item-path { font-size: 11px; color: #666; font-family: 'SF Mono', Menlo, monospace; }
.game-item-btn {
    background: #007ACC; color: #fff; border: none; border-radius: 4px;
    padding: 5px 14px; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.game-item-btn:hover { background: #0098ff; }
.dialog-empty { padding: 30px 18px; text-align: center; color: #555; font-size: 13px; }

/* AI 翻译配置弹窗 */
.ai-config-dialog { width: 560px; max-height: 90%; }
.ai-config-body {
    flex: 1; overflow-y: auto; padding: 16px 20px;
    display: flex; flex-direction: column; gap: 14px;
}
.ai-field { display: flex; flex-direction: column; gap: 4px; }
.ai-field-label { font-size: 12px; color: #9cdcfe; font-weight: 600; }
.ai-field-hint { font-size: 11px; color: #666; line-height: 1.4; }
.ai-input {
    background: #2a2a2a; border: 1px solid #404040; color: #d4d4d4;
    border-radius: 4px; padding: 7px 10px; font-size: 13px; outline: none;
    box-sizing: border-box; width: 100%; font-family: inherit;
}
.ai-input:focus { border-color: #007ACC; }
.ai-textarea { resize: vertical; min-height: 120px; line-height: 1.5; font-size: 12px; }
.ai-model-row { display: flex; gap: 8px; align-items: center; }
.ai-select { flex: 1; cursor: pointer; }
.ai-fetch-btn {
    background: #2a3a4a; border: 1px solid #007ACC; color: #4a9cd6;
    border-radius: 4px; padding: 7px 14px; font-size: 12px; cursor: pointer;
    white-space: nowrap; flex-shrink: 0;
}
.ai-fetch-btn:hover:not(:disabled) { background: #007ACC; color: #fff; }
.ai-fetch-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ai-config-footer {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 18px; border-top: 1px solid #2a2a2a;
}
.ai-field-row { display: flex; gap: 12px; }

/* 取消翻译浮条 */
.ai-cancel-bar {
    position: absolute; bottom: 32px; right: 16px; z-index: 50;
    display: flex; align-items: center; gap: 8px;
    background: #1a2a3a; border: 1px solid #007ACC; border-radius: 4px;
    padding: 6px 12px; font-size: 12px; color: #4a9cd6;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.ai-cancel-bar.hidden { display: none; }
.ai-cancel-btn {
    background: #3a1a1a; color: #f66; border: 1px solid #4a2a2a;
    border-radius: 3px; padding: 3px 10px; font-size: 11px; cursor: pointer;
}
.ai-cancel-btn:hover { background: #4a2020; color: #f88; }

/* 覆盖确认弹窗 */
.overwrite-confirm-dialog { width: 480px; }

/* 调整翻译弹窗 */
.adjust-dialog { width: 520px; max-height: 90%; }
.adjust-current-text {
    background: #1a1a1a; border: 1px solid #2a2a2a; color: #aaa;
    border-radius: 4px; padding: 8px 10px; font-size: 12px;
    line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    max-height: 100px; overflow-y: auto;
}

/* 三栏内容区 */
#content-area {
    display: flex; flex: 1; overflow: hidden;
}

/* 栏通用 */
.col-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; background: #141414; border-bottom: 1px solid #2a2a2a;
    min-height: 36px; gap: 8px;
}
.col-header span { font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; }
.col-header-actions { display: flex; align-items: center; gap: 4px; }
.col-header-btn {
    background: none; border: 1px solid #404040; color: #007ACC;
    border-radius: 4px; padding: 2px 8px; font-size: 14px; cursor: pointer; line-height: 1;
}
.col-header-btn:hover { background: #007ACC; color: #fff; border-color: #007ACC; }
.col-header-btn.danger { color: #f66; }
.col-header-btn.danger:hover { background: #a03030; color: #fff; border-color: #a03030; }
.col-body { flex: 1; overflow-y: auto; }

/* 最左栏 - 配置文件 */
#col-source {
    width: 200px; min-width: 160px; display: flex; flex-direction: column;
    border-right: 1px solid #2a2a2a; background: #111;
}
.source-item {
    display: flex; align-items: center; padding: 10px 12px; cursor: pointer;
    border-bottom: 1px solid #1a1a1a; transition: background 0.1s;
}
.source-item:hover { background: #1a1a1a; }
.source-item.active { background: #1a2a3a; border-left: 3px solid #007ACC; }
.source-item-name {
    font-size: 13px; color: #d4d4d4; flex: 1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.source-item.active .source-item-name { color: #fff; }

/* 左栏 - 命名空间 */
#col-ns {
    width: 220px; min-width: 180px; display: flex; flex-direction: column;
    border-right: 1px solid #2a2a2a; background: #111;
}
.ns-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #1a1a1a;
    transition: background 0.1s;
}
.ns-item:hover { background: #1a1a1a; }
.ns-item.active { background: #1a2a3a; border-left: 3px solid #007ACC; }
.ns-item-name { font-size: 13px; color: #d4d4d4; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ns-item.active .ns-item-name { color: #fff; }
.ns-item-count { font-size: 11px; color: #555; margin-left: 6px; }
.ns-rename-input {
    flex: 1; background: #2a2a2a; border: 1px solid #007ACC; color: #d4d4d4;
    border-radius: 3px; padding: 2px 6px; font-size: 12px; outline: none;
}

/* 命名空间底部操作 */
#ns-footer {
    display: flex; gap: 4px; padding: 6px 8px;
    border-top: 1px solid #2a2a2a; background: #111; flex-shrink: 0;
}
.ns-footer-btn {
    flex: 1; background: #1a1a1a; color: #888; border: 1px solid #2a2a2a;
    border-radius: 4px; padding: 5px 0; font-size: 11px; cursor: pointer;
    text-align: center;
}
.ns-footer-btn:hover:not(:disabled) { background: #252525; color: #ccc; border-color: #404040; }
.ns-footer-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.ns-footer-btn.danger:hover:not(:disabled) { color: #f66; border-color: #4a2a2a; }

/* 中栏 - Key 列表 */
#col-keys {
    width: 280px; min-width: 220px; display: flex; flex-direction: column;
    border-right: 1px solid #2a2a2a; background: #111;
}
.search-input {
    flex: 1; background: #1a1a1a; border: 1px solid #333; color: #d4d4d4;
    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;
}
.search-input:focus { border-color: #007ACC; }
.key-item {
    display: flex; flex-direction: column;
    padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #1a1a1a;
    transition: background 0.1s;
}
.key-item:hover { background: #1a1a1a; }
.key-item.active { background: #1a2a3a; border-left: 3px solid #007ACC; }
.key-item-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.key-item-name { font-size: 13px; color: #d4d4d4; display: flex; align-items: center; gap: 6px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-item.active .key-item-name { color: #fff; }
.key-item-name::before { content: '🔑'; font-size: 10px; flex-shrink: 0; }
.key-item-preview { font-size: 11px; color: #555; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-ref-count { font-size: 11px; color: #4a9; white-space: nowrap; flex-shrink: 0; }
.key-ref-count.unused { color: #a86; }

/* Key 列表底部 */
#key-list-footer {
    padding: 6px 8px; border-top: 1px solid #2a2a2a; background: #111; flex-shrink: 0;
}
.key-footer-btn {
    width: 100%; background: #1a1a1a; color: #888; border: 1px solid #2a2a2a;
    border-radius: 4px; padding: 5px 0; font-size: 11px; cursor: pointer;
    text-align: center;
}
.key-footer-btn:hover { background: #252525; color: #ccc; border-color: #404040; }

/* 右栏 - 翻译编辑 */
#col-edit {
    flex: 1; display: flex; flex-direction: column; background: #0D0D0D;
}
#edit-header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; background: #141414; border-bottom: 1px solid #2a2a2a;
    min-height: 44px;
}
#edit-key-path { font-size: 14px; color: #e0e0e0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edit-copy-btn {
    background: none; border: 1px solid #404040; color: #888; border-radius: 4px;
    padding: 2px 8px; font-size: 11px; cursor: pointer; flex-shrink: 0;
}
.edit-copy-btn:hover { background: #252525; color: #ccc; border-color: #555; }
.edit-copy-btn.hidden { display: none; }

/* 变量提示栏 */
#var-hint-bar {
    padding: 6px 16px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
    font-size: 11px; color: #888; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
#var-hint-bar.hidden { display: none; }
.var-tag {
    display: inline-block; background: #252535; color: #8888cc; border: 1px solid #3a3a5a;
    border-radius: 3px; padding: 1px 6px; font-family: 'SF Mono', Menlo, monospace; font-size: 11px;
}
.var-warn {
    color: #e8a040; font-size: 11px; margin-left: 8px;
    display: flex; align-items: center; gap: 4px;
}
.var-hint-tip { color: #666; font-style: italic; }
.var-warn::before { content: '⚠'; }

#edit-body { padding: 16px; }
.lang-editor {
    margin-bottom: 16px;
}
.lang-editor-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
}
.lang-editor-label {
    font-size: 12px; font-weight: 600; color: #007ACC;
    display: flex; align-items: center; gap: 6px;
}
.lang-editor-badge {
    background: #1a2a3a; color: #4a9cd6; font-size: 10px; padding: 1px 6px;
    border-radius: 3px;
}
.lang-editor-actions { display: flex; align-items: center; gap: 4px; }
.lang-editor-action {
    background: #1a2a3a; border: 1px solid #2a3a4a; color: #4a9cd6;
    border-radius: 3px; padding: 2px 8px; font-size: 11px; cursor: pointer;
    line-height: 1.4; white-space: nowrap;
}
.lang-editor-action:hover:not(:disabled) { background: #007ACC; color: #fff; border-color: #007ACC; }
.lang-editor-action:disabled { opacity: 0.4; cursor: not-allowed; }
.lang-editor-action.loading { opacity: 0.6; cursor: progress; }
.lang-editor-clear {
    background: none; border: none; color: #555; cursor: pointer; font-size: 11px;
}
.lang-editor-clear:hover { color: #aaa; }
.lang-textarea.translating {
    background: #102030; opacity: 0.7;
}
.lang-textarea {
    width: 100%; box-sizing: border-box; min-height: 60px; resize: vertical;
    background: #1a1a1a; color: #d4d4d4; border: 1px solid #2a2a2a;
    border-radius: 4px; padding: 8px 10px; font-size: 13px; font-family: inherit;
    outline: none; line-height: 1.5;
}
.lang-textarea:focus { border-color: #007ACC; }
.lang-missing-hint {
    margin-top: 4px; padding: 4px 8px; font-size: 11px; color: #e8a040;
    background: #2a2010; border: 1px solid #3a3020; border-radius: 3px;
}
.empty-hint {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #444; font-size: 14px; text-align: center;
}

/* 编辑区操作 */
#edit-actions {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; background: #141414; border-top: 1px solid #2a2a2a;
    flex-shrink: 0;
}
.actions-spacer { flex: 1; }
.action-btn {
    border: none; border-radius: 4px; padding: 5px 12px; font-size: 12px;
    cursor: pointer; color: #d4d4d4; white-space: nowrap;
}
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.action-btn.primary { background: #007ACC; color: #fff; }
.action-btn.primary:hover:not(:disabled) { background: #0098ff; }
.action-btn.danger { background: #3a1a1a; color: #f66; border: 1px solid #4a2a2a; }
.action-btn.danger:hover:not(:disabled) { background: #4a2020; }
.action-btn.ghost { background: transparent; color: #888; border: 1px solid #404040; }
.action-btn.ghost:hover:not(:disabled) { background: #252525; color: #d4d4d4; }

/* 选择模式操作条 */
.pick-mode-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px; background: #1a3a1a; border-top: 2px solid #4c8;
    font-size: 13px; color: #8c8;
}
.pick-mode-bar.hidden { display: none; }
.pick-mode-actions { display: flex; gap: 8px; }
.pick-cancel-btn {
    background: #333; border: 1px solid #555; color: #ccc;
    border-radius: 4px; padding: 5px 16px; font-size: 12px; cursor: pointer;
}
.pick-cancel-btn:hover { background: #444; }
.pick-confirm-btn {
    background: #0e639c; border: none; color: #fff;
    border-radius: 4px; padding: 5px 20px; font-size: 12px; cursor: pointer; font-weight: 600;
}
.pick-confirm-btn:hover:not(:disabled) { background: #1177bb; }
.pick-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 状态栏 */
#status-bar {
    display: flex; align-items: center; padding: 4px 16px; background: #007ACC;
    min-height: 22px;
}
#status-text { font-size: 12px; color: #fff; }

/* 滚动条 */
.col-body::-webkit-scrollbar { width: 6px; }
.col-body::-webkit-scrollbar-track { background: transparent; }
.col-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
.col-body::-webkit-scrollbar-thumb:hover { background: #555; }
`;

export const $ = {
    'source-list': '#source-list',
    'btn-add-source': '#btn-add-source',
    'btn-remove-source': '#btn-remove-source',
    'btn-lang-manage': '#btn-lang-manage',
    'lang-manage-overlay': '#lang-manage-overlay',
    'lang-list': '#lang-list',
    'new-lang-input': '#new-lang-input',
    'btn-add-new-lang': '#btn-add-new-lang',
    'btn-close-lang-dialog': '#btn-close-lang-dialog',
    'btn-add-ns': '#btn-add-ns',
    'ns-list': '#ns-list',
    'btn-rename-ns': '#btn-rename-ns',
    'btn-delete-ns': '#btn-delete-ns',
    'key-search': '#key-search',
    'btn-add-key': '#btn-add-key',
    'key-list': '#key-list',
    'btn-rescan-refs': '#btn-rescan-refs',
    'edit-key-path': '#edit-key-path',
    'btn-copy-key': '#btn-copy-key',
    'var-hint-bar': '#var-hint-bar',
    'edit-body': '#edit-body',
    'edit-actions': '#edit-actions',
    'btn-cancel-key': '#btn-cancel-key',
    'btn-save-key': '#btn-save-key',
    'btn-delete-key': '#btn-delete-key',
    'pick-mode-bar': '#pick-mode-bar',
    'pick-mode-hint': '#pick-mode-hint',
    'btn-cancel-pick': '#btn-cancel-pick',
    'btn-confirm-pick': '#btn-confirm-pick',
    'status-text': '#status-text',
    'add-source-overlay': '#add-source-overlay',
    'available-games-list': '#available-games-list',
    'btn-close-dialog': '#btn-close-dialog',
    'btn-ai-config': '#btn-ai-config',
    'ai-config-overlay': '#ai-config-overlay',
    'btn-close-ai-dialog': '#btn-close-ai-dialog',
    'ai-base-url': '#ai-base-url',
    'ai-api-key': '#ai-api-key',
    'ai-model-select': '#ai-model-select',
    'btn-fetch-models': '#btn-fetch-models',
    'ai-model-status': '#ai-model-status',
    'ai-prompt': '#ai-prompt',
    'btn-cancel-ai-config': '#btn-cancel-ai-config',
    'btn-save-ai-config': '#btn-save-ai-config',
    'ai-timeout-sec': '#ai-timeout-sec',
    'ai-retries': '#ai-retries',
    'btn-test-connection': '#btn-test-connection',
    'ai-test-status': '#ai-test-status',
    'ai-cancel-bar': '#ai-cancel-bar',
    'ai-cancel-text': '#ai-cancel-text',
    'btn-cancel-ai': '#btn-cancel-ai',
    'overwrite-confirm-overlay': '#overwrite-confirm-overlay',
    'overwrite-confirm-hint': '#overwrite-confirm-hint',
    'btn-close-overwrite-dialog': '#btn-close-overwrite-dialog',
    'btn-overwrite-cancel': '#btn-overwrite-cancel',
    'btn-overwrite-skip': '#btn-overwrite-skip',
    'btn-overwrite-all': '#btn-overwrite-all',
    'adjust-overlay': '#adjust-overlay',
    'adjust-dialog-title': '#adjust-dialog-title',
    'btn-close-adjust-dialog': '#btn-close-adjust-dialog',
    'adjust-current-text': '#adjust-current-text',
    'adjust-instruction': '#adjust-instruction',
    'btn-adjust-cancel': '#btn-adjust-cancel',
    'btn-adjust-submit': '#btn-adjust-submit',
};

// ==================== 渲染 ====================

/** 获取当前数据源的完整数据 */
function getSourceData(): Record<string, Record<string, Record<string, string>>> | null {
    if (!payload || !payload.fullData[selectedSourceIndex]) return null;
    return payload.fullData[selectedSourceIndex].data;
}

/** 渲染配置文件列表 */
function renderSourceList() {
    const list = panelRef?.$['source-list'] as HTMLElement;
    if (!list || !payload) return;

    if (payload.sources.length === 0) {
        list.innerHTML = '<div class="empty-hint">暂无数据源</div>';
    } else {
        list.innerHTML = payload.sources.map((s, i) => {
            const isActive = i === selectedSourceIndex;
            return `<div class="source-item${isActive ? ' active' : ''}" data-index="${i}">
                <span class="source-item-name">${esc(s.name)}</span>
            </div>`;
        }).join('');

        // 绑定点击切换
        list.querySelectorAll('.source-item').forEach((el: Element) => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.getAttribute('data-index') || '0', 10) || 0;
                if (idx === selectedSourceIndex) return;
                selectedSourceIndex = idx;
                selectedNamespace = '';
                selectedKey = '';
                renderSourceList();
                renderNamespaces();
                renderKeys();
                renderEditor();
            });
        });
    }

    // 平台数据源不能移除，隐藏 − 按钮
    const removeBtn = panelRef?.$['btn-remove-source'] as HTMLElement;
    if (removeBtn) {
        const isPlatform = payload.sources[selectedSourceIndex]?.name === '平台 (platform)';
        removeBtn.style.display = isPlatform ? 'none' : 'flex';
    }
}

/** 渲染命名空间列表 */
function renderNamespaces() {
    const list = panelRef?.$['ns-list'] as HTMLElement;
    if (!list) return;

    const data = getSourceData();
    if (!data) {
        list.innerHTML = '<div class="empty-hint">无数据源</div>';
        return;
    }

    const namespaces = Object.keys(data);
    if (namespaces.length === 0) {
        list.innerHTML = '<div class="empty-hint">暂无命名空间<br>点击 + 创建</div>';
        return;
    }

    list.innerHTML = namespaces.map(ns => {
        const keyCount = Object.keys(data[ns] || {}).length;
        const isActive = ns === selectedNamespace;
        const isRenaming = ns === renamingNs;

        if (isRenaming) {
            return `<div class="ns-item active" data-ns="${esc(ns)}">
                <input class="ns-rename-input" type="text" value="${esc(ns)}" data-old="${esc(ns)}">
            </div>`;
        }

        return `<div class="ns-item${isActive ? ' active' : ''}" data-ns="${esc(ns)}">
            <span class="ns-item-name">${esc(ns)}</span>
            <span class="ns-item-count">${keyCount} 个键</span>
        </div>`;
    }).join('');

    // 绑定点击事件
    list.querySelectorAll('.ns-item').forEach((el: Element) => {
        const ns = el.getAttribute('data-ns')!;

        el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('ns-rename-input')) return;
            selectNamespace(ns);
        });
    });

    // 更新底部按钮禁用状态
    const renameBtn = panelRef?.$['btn-rename-ns'] as HTMLButtonElement;
    const deleteBtn = panelRef?.$['btn-delete-ns'] as HTMLButtonElement;
    if (renameBtn) renameBtn.disabled = !selectedNamespace;
    if (deleteBtn) deleteBtn.disabled = !selectedNamespace;

    // 重命名输入框事件
    const renameInput = list.querySelector('.ns-rename-input') as HTMLInputElement;
    if (renameInput) {
        const commitRename = () => {
            const newName = renameInput.value.trim();
            const oldName = renameInput.getAttribute('data-old')!;
            renamingNs = '';
            if (newName && newName !== oldName) {
                Editor.Message.send('framework-plugin', 'i18n-rename-namespace', JSON.stringify({
                    sourceIndex: selectedSourceIndex,
                    oldName,
                    newName,
                }));
                if (selectedNamespace === oldName) {
                    selectedNamespace = newName;
                }
            } else {
                renderNamespaces();
            }
        };

        renameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
                renamingNs = '';
                renderNamespaces();
            }
        });
        renameInput.addEventListener('blur', commitRename);
    }
}

/** 渲染 Key 列表 */
function renderKeys() {
    const list = panelRef?.$['key-list'] as HTMLElement;
    if (!list) return;

    const data = getSourceData();
    if (!data || !selectedNamespace || !data[selectedNamespace]) {
        list.innerHTML = '<div class="empty-hint">请先选择命名空间</div>';
        return;
    }

    const nsData = data[selectedNamespace];
    let keys = Object.keys(nsData);

    // 搜索过滤
    if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        keys = keys.filter(k => {
            if (k.toLowerCase().includes(kw)) return true;
            // 也搜索翻译内容
            const translations = nsData[k];
            return Object.values(translations).some(v => v.toLowerCase().includes(kw));
        });
    }

    if (keys.length === 0) {
        list.innerHTML = `<div class="empty-hint">${searchKeyword ? '无匹配结果' : '暂无 Key<br>点击 + 创建'}</div>`;
        return;
    }

    const refCounts = payload?.refCounts || {};

    list.innerHTML = keys.map(key => {
        const isActive = key === selectedKey;
        const translations = nsData[key] || {};
        // 显示第一个有值的翻译作为预览
        const preview = Object.values(translations).find(v => v) || '';
        // 引用次数：完整 key = namespace.key
        const fullKey = `${selectedNamespace}.${key}`;
        const refCount = refCounts[fullKey] || 0;
        const refText = refCount > 0
            ? `<span class="key-ref-count" title="被引用 ${refCount} 次">${refCount} 个引用</span>`
            : `<span class="key-ref-count unused" title="未被引用">0 个引用</span>`;
        return `<div class="key-item${isActive ? ' active' : ''}" data-key="${esc(key)}">
            <div class="key-item-row">
                <div class="key-item-name">${esc(key)}</div>
                ${refText}
            </div>
            <div class="key-item-preview">${esc(preview)}</div>
        </div>`;
    }).join('');

    // 绑定点击
    list.querySelectorAll('.key-item').forEach((el: Element) => {
        el.addEventListener('click', () => {
            selectKey(el.getAttribute('data-key')!);
        });
    });
}

/** 检测当前编辑内容是否和原始数据不同 */
function isDirty(): boolean {
    const current = collectTranslations();
    for (const lang of Object.keys(current)) {
        if ((current[lang] || '') !== (originalTranslations[lang] || '')) return true;
    }
    for (const lang of Object.keys(originalTranslations)) {
        if ((current[lang] || '') !== (originalTranslations[lang] || '')) return true;
    }
    return false;
}

/** 根据脏状态更新取消/保存按钮的显隐 */
function updateDirtyState() {
    const cancelBtn = panelRef?.$['btn-cancel-key'] as HTMLElement;
    const saveBtn = panelRef?.$['btn-save-key'] as HTMLElement;
    if (!cancelBtn || !saveBtn) return;
    const dirty = isDirty();
    cancelBtn.style.visibility = dirty ? 'visible' : 'hidden';
    saveBtn.style.visibility = dirty ? 'visible' : 'hidden';
}

/** 提取文本中的 {xxx} 变量占位符 */
function extractVars(text: string): string[] {
    const matches = text.match(/\{(\w+)\}/g);
    return matches ? [...new Set(matches.map(m => m.slice(1, -1)))] : [];
}

/** 渲染翻译编辑区 */
function renderEditor() {
    const keyPathEl = panelRef?.$['edit-key-path'] as HTMLElement;
    const copyBtn = panelRef?.$['btn-copy-key'] as HTMLElement;
    const varHintBar = panelRef?.$['var-hint-bar'] as HTMLElement;
    const body = panelRef?.$['edit-body'] as HTMLElement;
    const cancelBtn = panelRef?.$['btn-cancel-key'] as HTMLButtonElement;
    const saveBtn = panelRef?.$['btn-save-key'] as HTMLButtonElement;
    const deleteBtn = panelRef?.$['btn-delete-key'] as HTMLButtonElement;
    if (!body) return;

    if (!selectedKey || !selectedNamespace) {
        if (keyPathEl) keyPathEl.textContent = '选择一个 Key 进行编辑';
        if (copyBtn) copyBtn.classList.add('hidden');
        if (varHintBar) varHintBar.classList.add('hidden');
        body.innerHTML = '<div class="empty-hint">← 从左侧选择一个 Key</div>';
        if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.visibility = 'hidden'; }
        if (saveBtn) { saveBtn.disabled = true; saveBtn.style.visibility = 'hidden'; }
        if (deleteBtn) deleteBtn.disabled = true;
        return;
    }

    const data = getSourceData();
    if (!data) return;

    const translations = data[selectedNamespace]?.[selectedKey] || {};
    // 保存原始翻译快照
    originalTranslations = {};
    const allLangs = payload?.languages || [];
    for (const lang of allLangs) {
        originalTranslations[lang] = translations[lang] || '';
    }

    const fullKeyPath = `${selectedNamespace}.${selectedKey}`;
    if (keyPathEl) keyPathEl.textContent = fullKeyPath;
    if (copyBtn) copyBtn.classList.remove('hidden');
    if (deleteBtn) deleteBtn.disabled = false;
    // 取消/保存初始隐藏（未修改时不显示）
    if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.style.visibility = 'hidden'; }
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.visibility = 'hidden'; }

    const langs = payload?.languages || [];

    const primaryLang = payload?.primaryLang || langs[0] || '';
    const primaryValue = translations[primaryLang] || '';

    body.innerHTML = langs.map(lang => {
        const value = translations[lang] || '';
        const isPrimary = lang === primaryLang;
        // 非主语言且为空时，显示回退提示
        let missingHint = '';
        if (!isPrimary && !value) {
            missingHint = primaryValue
                ? `<div class="lang-missing-hint">⚠ 未翻译，运行时将回退到主语言（${esc(primaryLang)}）: "${esc(primaryValue)}"</div>`
                : `<div class="lang-missing-hint">⚠ 未翻译，主语言也无翻译，运行时将显示 Key 本身</div>`;
        }
        if (isPrimary && !value) {
            missingHint = `<div class="lang-missing-hint">⚠ 主语言未定义，其他缺少翻译的语言将无法回退</div>`;
        }
        return `<div class="lang-editor">
            <div class="lang-editor-header">
                <span class="lang-editor-label">
                    ${esc(lang)}
                    ${isPrimary ? '<span class="lang-editor-badge">主语言</span>' : ''}
                </span>
                <div class="lang-editor-actions">
                    <button class="lang-editor-action lang-editor-translate" data-lang="${esc(lang)}" title="用此语言文本翻译填充其他语言">🌐 翻译填充</button>
                    <button class="lang-editor-action lang-editor-adjust" data-lang="${esc(lang)}" title="基于补充描述,AI 重新生成此语言">✨ 调整</button>
                    <button class="lang-editor-clear" data-lang="${esc(lang)}" title="清空此语言的翻译">清空</button>
                </div>
            </div>
            <textarea class="lang-textarea" data-lang="${esc(lang)}" placeholder="输入 ${esc(lang)} 翻译...">${esc(value)}</textarea>
            ${missingHint}
        </div>`;
    }).join('');

    if (langs.length === 0) {
        body.innerHTML = '<div class="empty-hint">暂无语言<br>点击顶部「+ 语言」添加</div>';
    }

    // 变量提示和实时校验
    updateVarHints();

    // textarea 输入时实时校验变量 + 脏检测
    body.querySelectorAll('.lang-textarea').forEach((ta: Element) => {
        ta.addEventListener('input', () => {
            updateVarHints();
            updateDirtyState();
        });
        // 粘贴时：仅当输入框严格为空时，自动 trim 粘贴文本首尾的空白
        // 覆盖范围：\s（含全角空格 U+3000、不间断空格 U+00A0、Tab、换行等）+ 零宽字符（U+200B~U+200D、U+FEFF）
        ta.addEventListener('paste', (e: Event) => {
            const target = e.currentTarget as HTMLTextAreaElement;
            if (target.value !== '') return;
            const pasteEvent = e as ClipboardEvent;
            const text = pasteEvent.clipboardData?.getData('text');
            if (!text) return;
            // \s 已涵盖全角空格 U+3000、不间断空格 U+00A0 等；额外补零宽字符（U+200B~U+200D、U+FEFF）
            const trimClass = '[\\s\\u200B\\u200C\\u200D\\uFEFF]+';
            const trimRe = new RegExp('^' + trimClass + '|' + trimClass + '$', 'g');
            const trimmed = text.replace(trimRe, '');
            if (trimmed === text) return;
            pasteEvent.preventDefault();
            // 用 execCommand 插入以保留 undo 历史，并自动触发 input 事件链路
            if (!document.execCommand('insertText', false, trimmed)) {
                target.value = trimmed;
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });

    // 清空按钮
    body.querySelectorAll('.lang-editor-clear').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang')!;
            const ta = body.querySelector(`.lang-textarea[data-lang="${lang}"]`) as HTMLTextAreaElement;
            if (ta) { ta.value = ''; ta.focus(); updateVarHints(); updateDirtyState(); }
        });
    });

    // 翻译填充按钮
    body.querySelectorAll('.lang-editor-translate').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang')!;
            handleTranslateFill(lang);
        });
    });

    // 调整按钮
    body.querySelectorAll('.lang-editor-adjust').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang')!;
            handleAdjustOpen(lang);
        });
    });
}

/** 更新变量提示栏：汇总所有语言的变量，检测不一致 */
function updateVarHints() {
    const varHintBar = panelRef?.$['var-hint-bar'] as HTMLElement;
    const body = panelRef?.$['edit-body'] as HTMLElement;
    if (!varHintBar || !body) return;

    // 收集每个语言当前输入框中的变量
    const langVarsMap: Record<string, string[]> = {};
    body.querySelectorAll('.lang-textarea').forEach((ta: Element) => {
        const lang = ta.getAttribute('data-lang')!;
        const text = (ta as HTMLTextAreaElement).value;
        langVarsMap[lang] = extractVars(text);
    });

    // 汇总所有出现过的变量（以有内容的语言为准）
    const allVars = new Set<string>();
    Object.values(langVarsMap).forEach(vars => vars.forEach(v => allVars.add(v)));

    varHintBar.classList.remove('hidden');

    if (allVars.size === 0) {
        varHintBar.innerHTML = '<span class="var-hint-tip">使用 {变量名} 来定义动态内容</span>';
        return;
    }

    // 变量标签
    let html = '<span>变量：</span>';
    allVars.forEach(v => { html += `<span class="var-tag">{${esc(v)}}</span>`; });

    // 检测不一致：如果某个有内容的语言缺少某变量
    const warnings: string[] = [];
    for (const [lang, vars] of Object.entries(langVarsMap)) {
        // 跳过空翻译
        const ta = body.querySelector(`.lang-textarea[data-lang="${lang}"]`) as HTMLTextAreaElement;
        if (!ta || !ta.value.trim()) continue;
        const missing = [...allVars].filter(v => !vars.includes(v));
        if (missing.length > 0) {
            warnings.push(`${lang} 缺少 {${missing.join('}, {')}}`);
        }
        // 检查这个语言有没有其他语言都没有的变量（可能打错了）
        const extras = vars.filter(v => {
            // 检查其他有内容的语言是否都没有此变量
            let othersHave = false;
            for (const [otherLang, otherVars] of Object.entries(langVarsMap)) {
                if (otherLang === lang) continue;
                const otherTa = body.querySelector(`.lang-textarea[data-lang="${otherLang}"]`) as HTMLTextAreaElement;
                if (!otherTa || !otherTa.value.trim()) continue;
                if (otherVars.includes(v)) { othersHave = true; break; }
            }
            return !othersHave;
        });
        if (extras.length > 0 && Object.keys(langVarsMap).length > 1) {
            warnings.push(`${lang} 独有 {${extras.join('}, {')}}，可能是拼写错误`);
        }
    }

    if (warnings.length > 0) {
        html += warnings.map(w => `<span class="var-warn">${esc(w)}</span>`).join('');
    }

    varHintBar.innerHTML = html;
}

/** 渲染添加数据源弹窗中的 Bundle 列表 */
function renderAvailableGames() {
    const list = panelRef?.$['available-games-list'] as HTMLElement;
    if (!list) return;

    if (availableGames.length === 0) {
        list.innerHTML = '<div class="dialog-empty">所有 Bundle 目录都已配置国际化数据源</div>';
        return;
    }

    list.innerHTML = availableGames.map(bundle => {
        return `<div class="game-item" data-game="${esc(bundle.name)}">
            <div class="game-item-info">
                <span class="game-item-name">${esc(bundle.name)}</span>
                <span class="game-item-path">${esc(bundle.relativePath)}</span>
            </div>
            <button class="game-item-btn">添加</button>
        </div>`;
    }).join('');

    // 绑定点击
    list.querySelectorAll('.game-item').forEach((el: Element) => {
        const bundleName = el.getAttribute('data-game')!;
        const bundle = availableGames.find(g => g.name === bundleName);

        el.querySelector('.game-item-btn')?.addEventListener('click', async () => {
            if (!bundle) return;
            const result = await Editor.Dialog.info(`将在以下路径创建 i18n 数据文件：\n\n${bundle.relativePath}`, {
                title: '确认添加', buttons: ['确认', '取消'], default: 0, cancel: 1,
            });
            if (result.response === 0) {
                pendingSwitchSource = bundleName;
                Editor.Message.send('framework-plugin', 'i18n-add-source', JSON.stringify({
                    bundleName,
                    targetPath: bundle.targetPath || '',
                }));
                closeAddSourceDialog();
            }
        });
    });
}

// ==================== 弹窗控制 ====================

function openAddSourceDialog() {
    const overlay = panelRef?.$['add-source-overlay'] as HTMLElement;
    if (overlay) {
        overlay.classList.remove('hidden');
        Editor.Message.send('framework-plugin', 'i18n-list-available-games', '');
    }
}

function closeAddSourceDialog() {
    const overlay = panelRef?.$['add-source-overlay'] as HTMLElement;
    if (overlay) overlay.classList.add('hidden');
}

function openLangManageDialog() {
    const overlay = panelRef?.$['lang-manage-overlay'] as HTMLElement;
    if (overlay) {
        overlay.classList.remove('hidden');
        renderLangList();
    }
}

function closeLangManageDialog() {
    const overlay = panelRef?.$['lang-manage-overlay'] as HTMLElement;
    if (overlay) overlay.classList.add('hidden');
}

// ==================== AI 翻译配置弹窗 ====================

/** 默认翻译提示词模板 */
const DEFAULT_AI_PROMPT = `你是专业的游戏本地化翻译。
请把以下 {sourceLang} 文本翻译为 {targetLang}。

要求：
1. 只输出译文，不要任何解释、引号或前后缀。
2. 完整保留原文中的占位符（如 {playerName}、{count} 等花括号变量），不翻译占位符内的内容。
3. 保留原文的换行、标点、空格风格。
4. 风格简洁、口语化，符合游戏 UI 语境。

原文：
{text}`;

function openAiConfigDialog() {
    const overlay = panelRef?.$['ai-config-overlay'] as HTMLElement;
    if (!overlay) return;
    overlay.classList.remove('hidden');
    setAiModelStatus('', '#666');
    // 加载现有配置
    loadAiConfigToForm();
}

function closeAiConfigDialog() {
    const overlay = panelRef?.$['ai-config-overlay'] as HTMLElement;
    if (overlay) overlay.classList.add('hidden');
}

function setAiModelStatus(text: string, color: string = '#666') {
    const el = panelRef?.$['ai-model-status'] as HTMLElement;
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
}

/** 把当前模型选项重置为给定列表，并保留/恢复指定值 */
function setAiModelOptions(models: string[], preferValue: string = '') {
    const sel = panelRef?.$['ai-model-select'] as HTMLSelectElement;
    if (!sel) return;
    if (models.length === 0) {
        sel.innerHTML = '<option value="">— 请先拉取模型列表 —</option>';
        return;
    }
    sel.innerHTML = models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    if (preferValue && models.includes(preferValue)) {
        sel.value = preferValue;
    } else if (preferValue) {
        // 已保存的模型不在最新列表中，仍然保留供用户参考
        const opt = document.createElement('option');
        opt.value = preferValue;
        opt.textContent = `${preferValue}（不在当前列表）`;
        sel.insertBefore(opt, sel.firstChild);
        sel.value = preferValue;
    }
}

/** 从后端加载配置到表单 */
async function loadAiConfigToForm() {
    try {
        // @ts-ignore
        const cfgStr: string = await Editor.Message.request('framework-plugin', 'i18n-load-ai-config');
        const cfg = cfgStr ? JSON.parse(cfgStr) : {};
        const baseUrl = panelRef?.$['ai-base-url'] as HTMLInputElement;
        const apiKey = panelRef?.$['ai-api-key'] as HTMLInputElement;
        const prompt = panelRef?.$['ai-prompt'] as HTMLTextAreaElement;
        const timeoutSec = panelRef?.$['ai-timeout-sec'] as HTMLInputElement;
        const retries = panelRef?.$['ai-retries'] as HTMLInputElement;
        const testStatus = panelRef?.$['ai-test-status'] as HTMLElement;
        if (baseUrl) baseUrl.value = cfg.baseUrl || '';
        if (apiKey) apiKey.value = cfg.apiKey || '';
        if (prompt) prompt.value = cfg.prompt || DEFAULT_AI_PROMPT;
        if (timeoutSec) timeoutSec.value = String(cfg.timeoutSec || 60);
        if (retries) retries.value = String(cfg.retries ?? 0);
        if (testStatus) { testStatus.textContent = ''; testStatus.style.color = '#666'; }
        const savedModel = cfg.model || '';
        const cachedModels: string[] = Array.isArray(cfg.cachedModels) ? cfg.cachedModels : [];
        if (cachedModels.length > 0) {
            setAiModelOptions(cachedModels, savedModel);
        } else if (savedModel) {
            setAiModelOptions([savedModel], savedModel);
        } else {
            setAiModelOptions([]);
        }
    } catch (e) {
        console.error('[i18n] 加载 AI 配置失败:', e);
        const prompt = panelRef?.$['ai-prompt'] as HTMLTextAreaElement;
        if (prompt && !prompt.value) prompt.value = DEFAULT_AI_PROMPT;
    }
}

/** 拉取模型列表 */
async function fetchAiModels() {
    const baseUrl = (panelRef?.$['ai-base-url'] as HTMLInputElement)?.value?.trim();
    const apiKey = (panelRef?.$['ai-api-key'] as HTMLInputElement)?.value?.trim();
    if (!baseUrl) {
        setAiModelStatus('请先填写供应商地址', '#e8a040');
        return;
    }
    if (!apiKey) {
        setAiModelStatus('请先填写 API Key', '#e8a040');
        return;
    }
    const fetchBtn = panelRef?.$['btn-fetch-models'] as HTMLButtonElement;
    if (fetchBtn) fetchBtn.disabled = true;
    setAiModelStatus('正在拉取模型列表...', '#569cd6');
    try {
        // @ts-ignore
        const result: any = await Editor.Message.request('framework-plugin', 'i18n-fetch-ai-models', JSON.stringify({ baseUrl, apiKey }));
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        if (!parsed?.ok) {
            setAiModelStatus(`拉取失败: ${parsed?.error || '未知错误'}`, '#f66');
            return;
        }
        const models: string[] = parsed.models || [];
        if (models.length === 0) {
            setAiModelStatus('返回的模型列表为空', '#e8a040');
            setAiModelOptions([]);
            return;
        }
        const currentSel = (panelRef?.$['ai-model-select'] as HTMLSelectElement)?.value || '';
        setAiModelOptions(models, currentSel);
        setAiModelStatus(`拉取成功，共 ${models.length} 个模型`, '#4ec9b0');
    } catch (e: any) {
        setAiModelStatus(`拉取失败: ${e?.message || e}`, '#f66');
    } finally {
        if (fetchBtn) fetchBtn.disabled = false;
    }
}

// ==================== AI 翻译/调整(在 Key 编辑面板) ====================

/** 当前调整中的语言(用于弹窗提交回调) */
let adjustingLang = '';
/** 取消标志:置 true 后串行循环跳出 */
let aiCancelled = false;
/** 当前是否在翻译中(用于互斥) */
let aiInFlight = false;

/** 关闭覆盖确认弹窗 */
function closeOverwriteConfirmDialog() {
    const overlay = panelRef?.$['overwrite-confirm-overlay'] as HTMLElement;
    if (overlay) overlay.classList.add('hidden');
}

/** 关闭调整弹窗 */
function closeAdjustDialog() {
    const overlay = panelRef?.$['adjust-overlay'] as HTMLElement;
    if (overlay) overlay.classList.add('hidden');
    adjustingLang = '';
}

/** 锁定/解锁某个语言的 textarea(翻译进行中) */
function setLangTranslating(lang: string, on: boolean) {
    const body = panelRef?.$['edit-body'] as HTMLElement;
    if (!body) return;
    const ta = body.querySelector(`.lang-textarea[data-lang="${lang}"]`) as HTMLTextAreaElement;
    if (ta) {
        ta.disabled = on;
        ta.classList.toggle('translating', on);
    }
    const translateBtn = body.querySelector(`.lang-editor-translate[data-lang="${lang}"]`) as HTMLButtonElement;
    const adjustBtn = body.querySelector(`.lang-editor-adjust[data-lang="${lang}"]`) as HTMLButtonElement;
    if (translateBtn) {
        translateBtn.disabled = on;
        translateBtn.classList.toggle('loading', on);
    }
    if (adjustBtn) {
        adjustBtn.disabled = on;
    }
}

/** 显示/隐藏右下角 AI 进行中浮条 */
function showAiCancelBar(text: string) {
    const bar = panelRef?.$['ai-cancel-bar'] as HTMLElement;
    const txt = panelRef?.$['ai-cancel-text'] as HTMLElement;
    if (bar) bar.classList.remove('hidden');
    if (txt) txt.textContent = text;
}
function hideAiCancelBar() {
    const bar = panelRef?.$['ai-cancel-bar'] as HTMLElement;
    if (bar) bar.classList.add('hidden');
}
function updateAiCancelBar(text: string) {
    const txt = panelRef?.$['ai-cancel-text'] as HTMLElement;
    if (txt) txt.textContent = text;
}

/** 用户点取消按钮:通知后端 abort 当前 fetch + 设置前端取消标志 */
async function cancelAiTranslate() {
    aiCancelled = true;
    try {
        // @ts-ignore
        await Editor.Message.request('framework-plugin', 'i18n-ai-cancel');
    } catch {}
    setStatus('已取消 AI 翻译', '#e8a040');
}

/** 调用一个语言的 AI 翻译(后端单次,可被取消) */
async function callAiOne(args: {
    sourceLang: string;
    sourceText: string;
    targetLang: string;
    instruction?: string;
}): Promise<{ ok: boolean; text?: string; error?: string; cost?: number }> {
    try {
        // @ts-ignore
        const result: any = await Editor.Message.request('framework-plugin', 'i18n-ai-translate-one', JSON.stringify(args));
        return typeof result === 'string' ? JSON.parse(result) : result;
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
    }
}

/** 并发翻译多个语言,完成一个立即填充该 textarea + 解锁,实时计数 + 可取消 */
async function callAiAndApply(args: {
    sourceLang: string;
    sourceText: string;
    targetLangs: string[];
    instruction?: string;
}): Promise<void> {
    if (aiInFlight) {
        setStatus('已有翻译任务进行中,请先取消或等待', '#e8a040');
        return;
    }
    aiInFlight = true;
    aiCancelled = false;
    const total = args.targetLangs.length;
    args.targetLangs.forEach(l => setLangTranslating(l, true));
    showAiCancelBar(`已完成 0/${total}（并发翻译中）...`);
    setStatus(`正在并发翻译 ${total} 个语言...`, '#569cd6');
    let successCount = 0;
    let failCount = 0;
    let firstErr = '';
    const body = panelRef?.$['edit-body'] as HTMLElement;

    try {
        // 所有语言并发发起,每个完成时立即填充该 textarea + 解锁该按钮 + 更新计数
        await Promise.all(args.targetLangs.map(async (lang) => {
            const res = await callAiOne({
                sourceLang: args.sourceLang,
                sourceText: args.sourceText,
                targetLang: lang,
                instruction: args.instruction,
            });
            if (aiCancelled) {
                // 已取消:不写值,只解锁
                setLangTranslating(lang, false);
                return;
            }
            if (res.ok && typeof res.text === 'string') {
                if (body) {
                    const ta = body.querySelector(`.lang-textarea[data-lang="${lang}"]`) as HTMLTextAreaElement;
                    if (ta) ta.value = res.text;
                }
                successCount++;
            } else {
                failCount++;
                if (!firstErr) firstErr = `${lang}: ${res.error || '未知错误'}`;
                console.warn(`[i18n-ai] ${lang} 失败:`, res.error);
            }
            setLangTranslating(lang, false);
            updateVarHints();
            updateDirtyState();
            const done = successCount + failCount;
            updateAiCancelBar(`已完成 ${done}/${total}${failCount > 0 ? `（失败 ${failCount}）` : ''}...`);
        }));

        // 取消时把可能漏掉的也解锁
        if (aiCancelled) {
            args.targetLangs.forEach(l => setLangTranslating(l, false));
            setStatus(`已取消 — 已完成 ${successCount}/${total}，记得点保存`, '#e8a040');
        } else if (failCount > 0) {
            setStatus(`完成 ${successCount}/${total}，失败 ${failCount}: ${firstErr}`, '#e8a040');
        } else {
            setStatus(`AI 翻译完成 (${successCount} 个语言)，记得点保存`, '#4ec9b0');
        }
    } finally {
        aiInFlight = false;
        aiCancelled = false;
        hideAiCancelBar();
    }
}

/** 翻译填充按钮:用 sourceLang 翻译填充其他语言 */
async function handleTranslateFill(sourceLang: string) {
    const body = panelRef?.$['edit-body'] as HTMLElement;
    if (!body) return;
    const sourceTa = body.querySelector(`.lang-textarea[data-lang="${sourceLang}"]`) as HTMLTextAreaElement;
    const sourceText = (sourceTa?.value || '').trim();
    if (!sourceText) {
        setStatus(`请先在 ${sourceLang} 中填入要翻译的文本`, '#e8a040');
        return;
    }
    // 收集其他所有语言
    const allLangs = payload?.languages || [];
    const otherLangs = allLangs.filter(l => l !== sourceLang);
    if (otherLangs.length === 0) {
        setStatus('没有其他可翻译的语言', '#e8a040');
        return;
    }
    // 检测哪些已有内容
    const occupied: string[] = [];
    for (const lang of otherLangs) {
        const ta = body.querySelector(`.lang-textarea[data-lang="${lang}"]`) as HTMLTextAreaElement;
        if (ta && ta.value.trim()) occupied.push(lang);
    }
    const doTranslate = (langs: string[]) => callAiAndApply({ sourceLang, sourceText, targetLangs: langs });

    if (occupied.length === 0) {
        // 全是空白，直接翻
        doTranslate(otherLangs);
        return;
    }
    // 有已存在内容，弹确认
    const overlay = panelRef?.$['overwrite-confirm-overlay'] as HTMLElement;
    const hint = panelRef?.$['overwrite-confirm-hint'] as HTMLElement;
    if (!overlay) return;
    if (hint) {
        hint.innerHTML = `检测到 <b style="color:#e8a040">${occupied.length}</b> 个目标语言已有翻译：<b>${esc(occupied.join(', '))}</b><br>请选择处理方式：<br>• <b>覆盖全部</b>：翻译并覆盖所有 ${otherLangs.length} 个目标语言<br>• <b>仅填空白</b>：只翻译尚未填写的 ${otherLangs.length - occupied.length} 个语言<br>• <b>取消</b>：不做任何操作`;
    }
    overlay.classList.remove('hidden');

    // 一次性绑定（每次重新绑，避免上次回调残留）
    const overwriteAll = panelRef?.$['btn-overwrite-all'] as HTMLButtonElement;
    const overwriteSkip = panelRef?.$['btn-overwrite-skip'] as HTMLButtonElement;
    const overwriteCancel = panelRef?.$['btn-overwrite-cancel'] as HTMLButtonElement;
    const cleanup = () => {
        overwriteAll.onclick = null;
        overwriteSkip.onclick = null;
        overwriteCancel.onclick = null;
    };
    overwriteAll.onclick = () => {
        cleanup();
        closeOverwriteConfirmDialog();
        doTranslate(otherLangs);
    };
    overwriteSkip.onclick = () => {
        cleanup();
        closeOverwriteConfirmDialog();
        const blankOnly = otherLangs.filter(l => !occupied.includes(l));
        if (blankOnly.length === 0) {
            setStatus('没有空白语言需要填充', '#888');
            return;
        }
        doTranslate(blankOnly);
    };
    overwriteCancel.onclick = () => {
        cleanup();
        closeOverwriteConfirmDialog();
    };
}

/** 调整按钮:打开调整弹窗 */
function handleAdjustOpen(targetLang: string) {
    const body = panelRef?.$['edit-body'] as HTMLElement;
    if (!body) return;
    const ta = body.querySelector(`.lang-textarea[data-lang="${targetLang}"]`) as HTMLTextAreaElement;
    const currentText = ta?.value || '';
    if (!currentText.trim()) {
        setStatus(`请先在 ${targetLang} 中填入原始文本，再使用「调整」`, '#e8a040');
        return;
    }
    adjustingLang = targetLang;
    const title = panelRef?.$['adjust-dialog-title'] as HTMLElement;
    const currentEl = panelRef?.$['adjust-current-text'] as HTMLElement;
    const instructionEl = panelRef?.$['adjust-instruction'] as HTMLTextAreaElement;
    const overlay = panelRef?.$['adjust-overlay'] as HTMLElement;
    if (title) title.textContent = `调整翻译 — ${targetLang}`;
    if (currentEl) currentEl.textContent = currentText;
    if (instructionEl) {
        instructionEl.value = '';
        setTimeout(() => instructionEl.focus(), 50);
    }
    if (overlay) overlay.classList.remove('hidden');
}

/** 调整提交 */
async function handleAdjustSubmit() {
    if (!adjustingLang) return;
    const instructionEl = panelRef?.$['adjust-instruction'] as HTMLTextAreaElement;
    const instruction = (instructionEl?.value || '').trim();
    if (!instruction) {
        setStatus('请输入补充描述', '#e8a040');
        instructionEl?.focus();
        return;
    }
    const body = panelRef?.$['edit-body'] as HTMLElement;
    if (!body) return;
    const ta = body.querySelector(`.lang-textarea[data-lang="${adjustingLang}"]`) as HTMLTextAreaElement;
    const currentText = ta?.value || '';
    const lang = adjustingLang;
    closeAdjustDialog();
    // 调整模式:sourceLang 和 targetLang 相同,把当前文本作为源
    await callAiAndApply({
        sourceLang: lang,
        sourceText: currentText,
        targetLangs: [lang],
        instruction,
    });
}

/** 收集表单到配置对象（不含 cachedModels） */
function collectAiConfigFromForm(): {
    baseUrl: string; apiKey: string; model: string; prompt: string;
    timeoutSec: number; retries: number; cachedModels: string[];
} {
    const baseUrl = (panelRef?.$['ai-base-url'] as HTMLInputElement)?.value?.trim() || '';
    const apiKey = (panelRef?.$['ai-api-key'] as HTMLInputElement)?.value?.trim() || '';
    const model = (panelRef?.$['ai-model-select'] as HTMLSelectElement)?.value || '';
    const prompt = (panelRef?.$['ai-prompt'] as HTMLTextAreaElement)?.value || '';
    const timeoutSec = parseInt((panelRef?.$['ai-timeout-sec'] as HTMLInputElement)?.value || '60', 10) || 60;
    const retries = parseInt((panelRef?.$['ai-retries'] as HTMLInputElement)?.value || '0', 10) || 0;
    const sel = panelRef?.$['ai-model-select'] as HTMLSelectElement;
    const cachedModels: string[] = [];
    if (sel) {
        for (let i = 0; i < sel.options.length; i++) {
            const v = sel.options[i].value;
            if (v) cachedModels.push(v);
        }
    }
    return { baseUrl, apiKey, model, prompt, timeoutSec, retries, cachedModels };
}

/** 保存 AI 配置 */
async function saveAiConfig() {
    const cfg = collectAiConfigFromForm();
    try {
        // @ts-ignore
        await Editor.Message.request('framework-plugin', 'i18n-save-ai-config', JSON.stringify(cfg));
        setStatus('AI 翻译配置已保存', '#4ec9b0');
        closeAiConfigDialog();
    } catch (e: any) {
        setStatus(`保存失败: ${e?.message || e}`, '#f66');
    }
}

/** 测试连接 */
async function testAiConnection() {
    const cfg = collectAiConfigFromForm();
    const statusEl = panelRef?.$['ai-test-status'] as HTMLElement;
    const btn = panelRef?.$['btn-test-connection'] as HTMLButtonElement;
    const setText = (text: string, color: string) => {
        if (statusEl) { statusEl.textContent = text; statusEl.style.color = color; }
    };
    if (!cfg.baseUrl) { setText('请先填供应商地址', '#e8a040'); return; }
    if (!cfg.apiKey) { setText('请先填 API Key', '#e8a040'); return; }
    if (!cfg.model) { setText('请先选模型（可先点「拉取模型列表」）', '#e8a040'); return; }
    if (btn) btn.disabled = true;
    setText(`正在测试（最长 ${cfg.timeoutSec}s）...`, '#569cd6');
    try {
        // @ts-ignore
        const result: any = await Editor.Message.request('framework-plugin', 'i18n-ai-test-connection', JSON.stringify({
            baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, timeoutSec: cfg.timeoutSec,
        }));
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        if (parsed?.ok) {
            setText(`✓ 连接成功 (${parsed.cost}ms) — 回复: ${parsed.reply || '(空)'}`, '#4ec9b0');
        } else {
            setText(`✗ 连接失败: ${parsed?.error || '未知错误'}`, '#f66');
        }
    } catch (e: any) {
        setText(`✗ 连接失败: ${e?.message || e}`, '#f66');
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** 渲染语言管理列表 */
function renderLangList() {
    const list = panelRef?.$['lang-list'] as HTMLElement;
    if (!list) return;

    const langs = payload?.languages || [];
    if (langs.length === 0) {
        list.innerHTML = '<div class="empty-hint">暂无语言<br>在下方输入语言代码添加</div>';
        return;
    }

    const primaryLang = payload?.primaryLang || langs[0] || '';

    list.innerHTML = langs.map(lang => {
        const isPrimary = lang === primaryLang;
        return `<div class="lang-item" data-lang="${esc(lang)}">
            <div class="lang-item-info">
                <span class="lang-item-code">${esc(lang)}</span>
                ${isPrimary ? '<span class="lang-item-badge">主语言</span>' : `<button class="lang-set-primary" data-lang="${esc(lang)}" title="设为主语言">设为主语言</button>`}
            </div>
            <div class="lang-item-actions">
                <button class="lang-item-delete" data-lang="${esc(lang)}"${isPrimary ? ' disabled title="不能删除主语言"' : ' title="删除此语言的所有翻译"'}>删除</button>
            </div>
        </div>`;
    }).join('');

    // 绑定设为主语言事件
    list.querySelectorAll('.lang-set-primary').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang')!;
            Editor.Message.send('framework-plugin', 'i18n-set-primary-lang', JSON.stringify({ langCode: lang }));
            // 刷新弹窗内列表
            setTimeout(() => renderLangList(), 300);
        });
    });

    // 绑定删除事件
    list.querySelectorAll('.lang-item-delete').forEach((btn: Element) => {
        btn.addEventListener('click', async () => {
            const lang = btn.getAttribute('data-lang')!;
            const result = await Editor.Dialog.warn(`确定删除语言 "${lang}" 吗？\n\n将清除所有数据源中该语言的翻译内容，此操作不可撤销！`, {
                title: '删除语言', buttons: ['删除', '取消'], default: 1, cancel: 1,
            });
            if (result.response === 0) {
                Editor.Message.send('framework-plugin', 'i18n-remove-language', JSON.stringify({ langCode: lang }));
                closeLangManageDialog();
            }
        });
    });
}

// ==================== 交互 ====================

function selectNamespace(ns: string) {
    selectedNamespace = ns;
    selectedKey = '';
    renamingNs = '';
    renderNamespaces();
    renderKeys();
    renderEditor();
}

function selectKey(key: string) {
    selectedKey = key;

    // 选择模式：更新提示并启用确认按钮
    if (pickMode && selectedNamespace) {
        updatePickModeUI();
    }

    renderKeys();
    renderEditor();
}

/** 收集编辑器中所有语言的翻译值 */
function collectTranslations(): Record<string, string> {
    const body = panelRef?.$['edit-body'] as HTMLElement;
    if (!body) return {};
    const result: Record<string, string> = {};
    body.querySelectorAll('.lang-textarea').forEach((ta: Element) => {
        const lang = ta.getAttribute('data-lang')!;
        result[lang] = (ta as HTMLTextAreaElement).value;
    });
    return result;
}

/**
 * 自动定位到指定的 fullKey（namespace.key）
 * 会自动切换数据源、选中命名空间和 key，并滚动到可见区域
 */
function navigateToKey(fullKey: string) {
    if (!fullKey || !payload) return;

    const dotIndex = fullKey.indexOf('.');
    if (dotIndex === -1) return;

    const ns = fullKey.substring(0, dotIndex);
    const key = fullKey.substring(dotIndex + 1);

    // 遍历所有数据源，找到包含此 namespace + key 的数据源
    for (let i = 0; i < payload.fullData.length; i++) {
        const sourceData = payload.fullData[i].data;
        if (sourceData[ns]?.[key] !== undefined) {
            // 切换数据源
            if (selectedSourceIndex !== i) {
                selectedSourceIndex = i;
                renderSourceList();
            }

            // 选中命名空间
            selectedNamespace = ns;
            renderNamespaces();

            // 选中 key
            selectedKey = key;
            renderKeys();
            renderEditor();

            // 滚动到可见区域
            setTimeout(() => {
                const nsList = panelRef?.$['ns-list'] as HTMLElement;
                const activeNs = nsList?.querySelector('.ns-item.active');
                activeNs?.scrollIntoView({ block: 'center', behavior: 'smooth' });

                const keyList = panelRef?.$['key-list'] as HTMLElement;
                const activeKey = keyList?.querySelector('.key-item.active');
                activeKey?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 50);
            return;
        }
    }

    // 没找到精确匹配，尝试只匹配 namespace（可能 key 还不存在）
    for (let i = 0; i < payload.fullData.length; i++) {
        const sourceData = payload.fullData[i].data;
        if (sourceData[ns]) {
            if (selectedSourceIndex !== i) {
                selectedSourceIndex = i;
                renderSourceList();
            }
            selectedNamespace = ns;
            selectedKey = '';
            renderNamespaces();
            renderKeys();
            renderEditor();

            setTimeout(() => {
                const nsList = panelRef?.$['ns-list'] as HTMLElement;
                const activeNs = nsList?.querySelector('.ns-item.active');
                activeNs?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 50);
            return;
        }
    }
}

/** 更新选择模式 UI */
function updatePickModeUI() {
    const bar = panelRef?.$['pick-mode-bar'] as HTMLElement;
    const hint = panelRef?.$['pick-mode-hint'] as HTMLElement;
    const confirmBtn = panelRef?.$['btn-confirm-pick'] as HTMLButtonElement;

    if (bar) {
        if (pickMode) {
            bar.classList.remove('hidden');
        } else {
            bar.classList.add('hidden');
        }
    }

    if (pickMode && hint && confirmBtn) {
        if (selectedNamespace && selectedKey) {
            const fullKey = `${selectedNamespace}.${selectedKey}`;
            hint.textContent = `🎯 已选择: ${fullKey}`;
            confirmBtn.disabled = false;
        } else {
            hint.textContent = '🎯 请选择一个 Key';
            confirmBtn.disabled = true;
        }
    }
}

function setStatus(text: string, color: string = '#fff') {
    const bar = panelRef?.$['status-text'] as HTMLElement;
    if (bar) {
        bar.textContent = text;
        bar.style.color = color;
    }
}

/** HTML 转义 */
function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== 生命周期 ====================

export function ready(this: any) {
    panelRef = this;

    // 选择模式：取消（关闭面板）
    this.$['btn-cancel-pick']?.addEventListener('click', () => {
        pickMode = false;
        updatePickModeUI();
        // @ts-ignore
        Editor.Panel.close('framework-plugin.i18n');
    });

    // 选择模式：确认选择
    this.$['btn-confirm-pick']?.addEventListener('click', () => {
        if (!pickMode || !selectedNamespace || !selectedKey) return;
        const fullKey = `${selectedNamespace}.${selectedKey}`;
        // @ts-ignore
        Editor.Message.send('framework-plugin', 'i18n-key-picked', fullKey);
        pickMode = false;
        // 关闭面板
        Editor.Panel.close('framework-plugin.i18n');
    });

    // 添加数据源
    this.$['btn-add-source']?.addEventListener('click', () => {
        openAddSourceDialog();
    });

    // 移除数据源
    this.$['btn-remove-source']?.addEventListener('click', async () => {
        if (!payload || !payload.sources[selectedSourceIndex]) return;

        const source = payload.sources[selectedSourceIndex];
        if (source.name === '平台 (platform)') {
            setStatus('不能移除平台数据源', '#ce9178');
            return;
        }

        const result = await Editor.Dialog.warn(`确定移除数据源 "${source.name}" 吗？\n\n将删除文件：${source.filePath}\n\n此操作不可撤销！`, {
            title: '移除数据源', buttons: ['删除', '取消'], default: 1, cancel: 1,
        });
        if (result.response === 0) {
            Editor.Message.send('framework-plugin', 'i18n-remove-source', JSON.stringify({
                sourceIndex: selectedSourceIndex,
            }));
            selectedSourceIndex = 0;
            selectedNamespace = '';
            selectedKey = '';
        }
    });

    // 关闭弹窗
    this.$['btn-close-dialog']?.addEventListener('click', closeAddSourceDialog);
    this.$['add-source-overlay']?.addEventListener('click', (e: Event) => {
        if (e.target === panelRef.$['add-source-overlay']) {
            closeAddSourceDialog();
        }
    });

    // 刷新引用统计
    this.$['btn-rescan-refs']?.addEventListener('click', () => {
        setStatus('正在扫描引用...');
        Editor.Message.send('framework-plugin', 'i18n-load-data', '');
    });

    // 语言管理
    this.$['btn-lang-manage']?.addEventListener('click', () => {
        openLangManageDialog();
    });

    // AI 翻译配置
    this.$['btn-ai-config']?.addEventListener('click', () => {
        openAiConfigDialog();
    });
    this.$['btn-close-ai-dialog']?.addEventListener('click', closeAiConfigDialog);
    this.$['btn-cancel-ai-config']?.addEventListener('click', closeAiConfigDialog);
    this.$['ai-config-overlay']?.addEventListener('click', (e: Event) => {
        if (e.target === panelRef.$['ai-config-overlay']) {
            closeAiConfigDialog();
        }
    });
    this.$['btn-fetch-models']?.addEventListener('click', fetchAiModels);
    this.$['btn-save-ai-config']?.addEventListener('click', saveAiConfig);
    this.$['btn-test-connection']?.addEventListener('click', testAiConnection);

    // AI 翻译进行中的取消按钮
    this.$['btn-cancel-ai']?.addEventListener('click', cancelAiTranslate);

    // 覆盖确认弹窗(✕ + 点遮罩)
    this.$['btn-close-overwrite-dialog']?.addEventListener('click', closeOverwriteConfirmDialog);
    this.$['overwrite-confirm-overlay']?.addEventListener('click', (e: Event) => {
        if (e.target === panelRef.$['overwrite-confirm-overlay']) {
            closeOverwriteConfirmDialog();
        }
    });

    // 调整弹窗
    this.$['btn-close-adjust-dialog']?.addEventListener('click', closeAdjustDialog);
    this.$['btn-adjust-cancel']?.addEventListener('click', closeAdjustDialog);
    this.$['adjust-overlay']?.addEventListener('click', (e: Event) => {
        if (e.target === panelRef.$['adjust-overlay']) {
            closeAdjustDialog();
        }
    });
    this.$['btn-adjust-submit']?.addEventListener('click', handleAdjustSubmit);
    // Cmd/Ctrl + Enter 在描述框中提交
    this.$['adjust-instruction']?.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleAdjustSubmit();
        } else if (e.key === 'Escape') {
            closeAdjustDialog();
        }
    });

    // 关闭语言管理弹窗
    this.$['btn-close-lang-dialog']?.addEventListener('click', closeLangManageDialog);
    this.$['lang-manage-overlay']?.addEventListener('click', (e: Event) => {
        if (e.target === panelRef.$['lang-manage-overlay']) {
            closeLangManageDialog();
        }
    });

    // 添加新语言
    this.$['btn-add-new-lang']?.addEventListener('click', () => {
        const input = panelRef?.$['new-lang-input'] as HTMLInputElement;
        const lang = input?.value?.trim();
        if (!lang) return;
        if (payload?.languages?.includes(lang)) {
            setStatus(`语言 "${lang}" 已存在`, '#ce9178');
            return;
        }
        Editor.Message.send('framework-plugin', 'i18n-add-language', JSON.stringify({ langCode: lang }));
        input.value = '';
        closeLangManageDialog();
    });
    // 回车也可添加
    this.$['new-lang-input']?.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            (panelRef?.$['btn-add-new-lang'] as HTMLElement)?.click();
        }
    });

    // 复制 Key 路径
    this.$['btn-copy-key']?.addEventListener('click', () => {
        if (selectedNamespace && selectedKey) {
            const fullPath = `${selectedNamespace}.${selectedKey}`;
            navigator.clipboard.writeText(fullPath).then(() => {
                setStatus(`已复制 "${fullPath}"`, '#4ec9b0');
            }).catch(() => {
                // fallback
                const ta = document.createElement('textarea');
                ta.value = fullPath;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                setStatus(`已复制 "${fullPath}"`, '#4ec9b0');
            });
        }
    });

    // 添加命名空间（内联输入框）
    this.$['btn-add-ns']?.addEventListener('click', () => {
        const list = panelRef?.$['ns-list'] as HTMLElement;
        if (!list) return;
        // 在列表顶部插入输入框
        const existing = list.querySelector('.ns-new-input');
        if (existing) { (existing as HTMLInputElement).focus(); return; }
        const row = document.createElement('div');
        row.className = 'ns-item active';
        row.innerHTML = '<input class="ns-new-input" type="text" placeholder="输入命名空间名称...">';
        list.insertBefore(row, list.firstChild);
        const input = row.querySelector('.ns-new-input') as HTMLInputElement;
        input.focus();
        const commit = () => {
            const val = input.value.trim();
            row.remove();
            if (val) {
                Editor.Message.send('framework-plugin', 'i18n-create-namespace', JSON.stringify({
                    sourceIndex: selectedSourceIndex,
                    namespace: val,
                }));
            }
        };
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') row.remove();
        });
        input.addEventListener('blur', commit);
    });

    // 重命名命名空间（底部按钮）
    this.$['btn-rename-ns']?.addEventListener('click', () => {
        if (!selectedNamespace) return;
        renamingNs = selectedNamespace;
        renderNamespaces();
        // 聚焦输入框
        const list = this.$['ns-list'] as HTMLElement;
        const input = list?.querySelector('.ns-rename-input') as HTMLInputElement;
        if (input) {
            input.focus();
            input.select();
        }
    });

    // 删除命名空间（底部按钮）
    this.$['btn-delete-ns']?.addEventListener('click', async () => {
        if (!selectedNamespace) return;
        const result = await Editor.Dialog.warn(`确定删除命名空间 "${selectedNamespace}" 及其所有 Key？`, {
            title: '删除命名空间',
            buttons: ['确定', '取消'],
            default: 1,
            cancel: 1,
        });
        if (result.response === 0) {
            const ns = selectedNamespace;
            Editor.Message.send('framework-plugin', 'i18n-delete-namespace', JSON.stringify({
                sourceIndex: selectedSourceIndex,
                namespace: ns,
            }));
            selectedNamespace = '';
            selectedKey = '';
        }
    });

    // 搜索
    const searchInput = this.$['key-search'] as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
        searchKeyword = searchInput.value;
        renderKeys();
    });

    // 添加 Key（内联输入框）
    this.$['btn-add-key']?.addEventListener('click', () => {
        if (!selectedNamespace) {
            setStatus('请先选择命名空间');
            return;
        }
        const list = panelRef?.$['key-list'] as HTMLElement;
        if (!list) return;
        const existing = list.querySelector('.key-new-input');
        if (existing) { (existing as HTMLInputElement).focus(); return; }
        const row = document.createElement('div');
        row.className = 'key-item active';
        row.innerHTML = '<input class="key-new-input" type="text" placeholder="输入 Key 名称...">';
        list.insertBefore(row, list.firstChild);
        const input = row.querySelector('.key-new-input') as HTMLInputElement;
        input.focus();
        const commit = () => {
            const val = input.value.trim();
            row.remove();
            if (val) {
                Editor.Message.send('framework-plugin', 'i18n-create-key', JSON.stringify({
                    sourceIndex: selectedSourceIndex,
                    namespace: selectedNamespace,
                    key: val,
                }));
            }
        };
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') row.remove();
        });
        input.addEventListener('blur', commit);
    });

    // 取消修改（恢复到保存前的数据）
    this.$['btn-cancel-key']?.addEventListener('click', () => {
        renderEditor();
        setStatus('已取消修改');
    });

    // 保存 Key 翻译
    this.$['btn-save-key']?.addEventListener('click', () => {
        if (!selectedKey || !selectedNamespace) return;
        const translations = collectTranslations();
        Editor.Message.send('framework-plugin', 'i18n-save-translations', JSON.stringify({
            sourceIndex: selectedSourceIndex,
            namespace: selectedNamespace,
            key: selectedKey,
            translations,
        }));
    });

    // 删除 Key
    this.$['btn-delete-key']?.addEventListener('click', async () => {
        if (!selectedKey || !selectedNamespace) return;
        const result = await Editor.Dialog.warn(`确定删除 Key "${selectedNamespace}.${selectedKey}"？`, {
            title: '删除 Key',
            buttons: ['确定', '取消'],
            default: 1,
            cancel: 1,
        });
        if (result.response === 0) {
            Editor.Message.send('framework-plugin', 'i18n-delete-key', JSON.stringify({
                sourceIndex: selectedSourceIndex,
                namespace: selectedNamespace,
                key: selectedKey,
            }));
            selectedKey = '';
        }
    });

    // 初始渲染
    renderNamespaces();
    renderKeys();
    renderEditor();

    // 主动请求数据（面板首次打开或重新加载时）
    Editor.Message.send('framework-plugin', 'i18n-load-data', '');

    // 检查是否需要进入选择模式（由 Inspector 触发打开面板时设置）
    setTimeout(async () => {
        try {
            // @ts-ignore
            const result = await Editor.Message.request('framework-plugin', 'i18n-check-pick-mode');
            if (result && !pickMode) {
                pickMode = true;
                // 如果返回了当前 key，自动定位
                const currentKey = (result as any)?.currentKey || '';
                if (currentKey) {
                    navigateToKey(currentKey);
                }
                updatePickModeUI();
                setStatus('选择模式：点击 Key 列表中的项目选择', '#8c8');
            }
        } catch {}
    }, 300);
}

export function close() {
    panelRef = null;
    payload = null;
    selectedSourceIndex = 0;
    selectedNamespace = '';
    selectedKey = '';
    searchKeyword = '';
    renamingNs = '';
    availableGames = [];
    pendingSwitchSource = '';
    originalTranslations = {};
    adjustingLang = '';
    aiCancelled = false;
    aiInFlight = false;
}

// ==================== 面板方法（接收消息） ====================

export const methods = {
    /** 接收完整 i18n 数据 */
    setI18nData(dataStr: string) {
        try {
            payload = JSON.parse(dataStr);
            if (!payload) return;

            // 如果有待切换的数据源（刚添加的），自动切换过去
            if (pendingSwitchSource) {
                const idx = payload.sources.findIndex(s => s.name === pendingSwitchSource);
                if (idx >= 0) {
                    selectedSourceIndex = idx;
                    selectedNamespace = '';
                    selectedKey = '';
                }
                pendingSwitchSource = '';
            }

            // 保持当前选中状态
            if (selectedSourceIndex >= payload.sources.length) {
                selectedSourceIndex = 0;
            }

            // 如果之前选中的命名空间已不存在，重置
            const data = getSourceData();
            if (data && selectedNamespace && !data[selectedNamespace]) {
                selectedNamespace = '';
                selectedKey = '';
            }

            renderSourceList();
            renderNamespaces();
            renderKeys();
            renderEditor();
        } catch (e) {
            console.error('[framework-plugin] 解析数据失败:', e);
        }
    },

    /** 接收状态消息 */
    setStatus(dataStr: string) {
        try {
            const { text, color } = JSON.parse(dataStr);
            setStatus(text, color || '#fff');
        } catch {}
    },

    /** 进入选择模式（从 Inspector 触发） */
    enterPickMode(currentKey?: string) {
        pickMode = true;
        // 如果传入了当前 key，自动定位到对应的 namespace + key
        if (currentKey) {
            navigateToKey(currentKey);
        }
        updatePickModeUI();
        setStatus('选择模式：点击 Key 列表中的项目选择', '#8c8');
    },

    /** 接收可添加 i18n 的游戏列表 */
    setAvailableGames(dataStr: string) {
        try {
            availableGames = JSON.parse(dataStr);
            renderAvailableGames();
        } catch (e) {
            console.error('[framework-plugin] 解析可用游戏列表失败:', e);
        }
    },
};
