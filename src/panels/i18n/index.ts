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
            <div id="source-group">
                <select id="source-selector"></select>
                <button id="btn-add-source" class="source-btn" title="为 Bundle 添加国际化数据源">+</button>
                <button id="btn-remove-source" class="source-btn danger" title="移除当前数据源">−</button>
            </div>
        </div>
        <div id="toolbar-right">
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

    <!-- 三栏内容 -->
    <div id="content-area">
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

/* 数据源选择器组 */
#source-group { display: flex; align-items: center; gap: 4px; }
#source-selector {
    background: #2a2a2a; color: #d4d4d4; border: 1px solid #404040;
    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;
}
.source-btn {
    background: #2a2a2a; color: #007ACC; border: 1px solid #404040;
    border-radius: 4px; width: 26px; height: 26px; font-size: 16px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; line-height: 1;
}
.source-btn:hover { background: #007ACC; color: #fff; border-color: #007ACC; }
.source-btn.danger { color: #f66; }
.source-btn.danger:hover { background: #a03030; color: #fff; border-color: #a03030; }

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
.col-header-btn {
    background: none; border: 1px solid #404040; color: #007ACC;
    border-radius: 4px; padding: 2px 8px; font-size: 14px; cursor: pointer; line-height: 1;
}
.col-header-btn:hover { background: #007ACC; color: #fff; border-color: #007ACC; }
.col-body { flex: 1; overflow-y: auto; }

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
.lang-editor-clear {
    background: none; border: none; color: #555; cursor: pointer; font-size: 11px;
}
.lang-editor-clear:hover { color: #aaa; }
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
    'source-selector': '#source-selector',
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
};

// ==================== 渲染 ====================

/** 获取当前数据源的完整数据 */
function getSourceData(): Record<string, Record<string, Record<string, string>>> | null {
    if (!payload || !payload.fullData[selectedSourceIndex]) return null;
    return payload.fullData[selectedSourceIndex].data;
}

/** 渲染数据源选择器 */
function renderSourceSelector() {
    const sel = panelRef?.$['source-selector'] as HTMLSelectElement;
    if (!sel || !payload) return;

    sel.innerHTML = payload.sources.map((s, i) =>
        `<option value="${i}"${i === selectedSourceIndex ? ' selected' : ''}>${s.name}</option>`
    ).join('');

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
                <button class="lang-editor-clear" data-lang="${esc(lang)}" title="清空此语言的翻译">清空</button>
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
    });

    // 清空按钮
    body.querySelectorAll('.lang-editor-clear').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang')!;
            const ta = body.querySelector(`.lang-textarea[data-lang="${lang}"]`) as HTMLTextAreaElement;
            if (ta) { ta.value = ''; ta.focus(); updateVarHints(); updateDirtyState(); }
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
                renderSourceSelector();
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
                renderSourceSelector();
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

    // 数据源切换
    const sourceSel = this.$['source-selector'] as HTMLSelectElement;
    sourceSel?.addEventListener('change', () => {
        selectedSourceIndex = parseInt(sourceSel.value) || 0;
        selectedNamespace = '';
        selectedKey = '';
        renderSourceSelector(); // 更新 − 按钮显隐
        renderNamespaces();
        renderKeys();
        renderEditor();
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

            renderSourceSelector();
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
