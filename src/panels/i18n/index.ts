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
    fullData: SourceFullData[];
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

/** 当前过滤语言（空 = 全部） */
let filterLang = '';

/** 正在重命名的命名空间 */
let renamingNs = '';

// ==================== 模板 ====================

export const template = `
<div id="i18n-panel">
    <!-- 顶部工具栏 -->
    <div id="toolbar">
        <div id="toolbar-left">
            <span class="toolbar-title">国际化资源管理</span>
            <select id="source-selector"></select>
        </div>
        <div id="toolbar-right">
            <button id="btn-reload" class="tool-btn" title="重新加载">↻</button>
            <button id="btn-add-lang" class="tool-btn" title="添加语言">+ 语言</button>
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
        </div>

        <!-- 中栏：Key 列表 -->
        <div id="col-keys">
            <div class="col-header">
                <input id="key-search" type="text" placeholder="搜索 Key..." class="search-input">
                <button id="btn-add-key" class="col-header-btn" title="新建 Key">+</button>
            </div>
            <div id="key-list" class="col-body"></div>
        </div>

        <!-- 右栏：翻译编辑 -->
        <div id="col-edit">
            <div class="col-header">
                <span id="edit-title">选择一个 Key 进行编辑</span>
                <select id="lang-filter" title="过滤语言">
                    <option value="">全部语言</option>
                </select>
            </div>
            <div id="edit-body" class="col-body"></div>
            <div id="edit-actions">
                <button id="btn-save-key" class="action-btn primary" disabled>保存</button>
                <button id="btn-delete-key" class="action-btn danger" disabled>删除 Key</button>
            </div>
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
#source-selector {
    background: #2a2a2a; color: #d4d4d4; border: 1px solid #404040;
    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;
}
.tool-btn {
    background: #2a2a2a; color: #d4d4d4; border: 1px solid #404040;
    border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.tool-btn:hover { background: #3a3a3a; }

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
.ns-item-actions { display: none; gap: 4px; margin-left: 6px; }
.ns-item:hover .ns-item-actions { display: flex; }
.ns-item:hover .ns-item-count { display: none; }
.ns-action-btn {
    background: none; border: none; color: #666; cursor: pointer;
    font-size: 12px; padding: 0 3px; line-height: 1;
}
.ns-action-btn:hover { color: #007ACC; }
.ns-action-btn.danger:hover { color: #f44; }
.ns-rename-input {
    flex: 1; background: #2a2a2a; border: 1px solid #007ACC; color: #d4d4d4;
    border-radius: 3px; padding: 2px 6px; font-size: 12px; outline: none;
}

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
.key-item-name { font-size: 13px; color: #d4d4d4; display: flex; align-items: center; gap: 6px; }
.key-item.active .key-item-name { color: #fff; }
.key-item-name::before { content: '🔑'; font-size: 10px; }
.key-item-preview { font-size: 11px; color: #555; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 右栏 - 翻译编辑 */
#col-edit {
    flex: 1; display: flex; flex-direction: column; background: #0D0D0D;
}
#edit-title { flex: 1; }
#lang-filter {
    background: #2a2a2a; color: #d4d4d4; border: 1px solid #404040;
    border-radius: 4px; padding: 3px 6px; font-size: 11px; outline: none;
}
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
.lang-editor-remove {
    background: none; border: none; color: #555; cursor: pointer; font-size: 11px;
}
.lang-editor-remove:hover { color: #f44; }
.lang-textarea {
    width: 100%; box-sizing: border-box; min-height: 60px; resize: vertical;
    background: #1a1a1a; color: #d4d4d4; border: 1px solid #2a2a2a;
    border-radius: 4px; padding: 8px 10px; font-size: 13px; font-family: inherit;
    outline: none; line-height: 1.5;
}
.lang-textarea:focus { border-color: #007ACC; }
.empty-hint {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: #444; font-size: 14px; text-align: center;
}

/* 编辑区操作 */
#edit-actions {
    display: flex; align-items: center; justify-content: flex-end; gap: 8px;
    padding: 10px 16px; background: #141414; border-top: 1px solid #2a2a2a;
}
.action-btn {
    border: none; border-radius: 4px; padding: 6px 16px; font-size: 12px;
    cursor: pointer; color: #d4d4d4;
}
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.primary { background: #007ACC; color: #fff; }
.action-btn.primary:hover:not(:disabled) { background: #0098ff; }
.action-btn.danger { background: #3a1a1a; color: #f66; border: 1px solid #4a2a2a; }
.action-btn.danger:hover:not(:disabled) { background: #4a2020; }

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
    'btn-reload': '#btn-reload',
    'btn-add-lang': '#btn-add-lang',
    'btn-add-ns': '#btn-add-ns',
    'ns-list': '#ns-list',
    'key-search': '#key-search',
    'btn-add-key': '#btn-add-key',
    'key-list': '#key-list',
    'edit-title': '#edit-title',
    'lang-filter': '#lang-filter',
    'edit-body': '#edit-body',
    'btn-save-key': '#btn-save-key',
    'btn-delete-key': '#btn-delete-key',
    'status-text': '#status-text',
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
}

/** 渲染语言过滤器 */
function renderLangFilter() {
    const sel = panelRef?.$['lang-filter'] as HTMLSelectElement;
    if (!sel || !payload) return;

    sel.innerHTML = `<option value="">全部语言</option>` +
        payload.languages.map(l => `<option value="${l}"${l === filterLang ? ' selected' : ''}>${l}</option>`).join('');
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
            <span class="ns-item-count">${keyCount}</span>
            <div class="ns-item-actions">
                <button class="ns-action-btn" data-action="rename" title="重命名">✎</button>
                <button class="ns-action-btn danger" data-action="delete" title="删除">✕</button>
            </div>
        </div>`;
    }).join('');

    // 绑定事件
    list.querySelectorAll('.ns-item').forEach((el: Element) => {
        const ns = el.getAttribute('data-ns')!;

        // 点击选中
        el.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('ns-action-btn') || target.classList.contains('ns-rename-input')) return;
            selectNamespace(ns);
        });

        // 重命名按钮
        el.querySelector('[data-action="rename"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            renamingNs = ns;
            renderNamespaces();
            // 聚焦输入框
            const input = list.querySelector('.ns-rename-input') as HTMLInputElement;
            if (input) {
                input.focus();
                input.select();
            }
        });

        // 删除按钮
        el.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`确定删除命名空间 "${ns}" 及其所有 Key？`)) {
                Editor.Message.send('framework-plugin', 'i18n-delete-namespace', JSON.stringify({
                    sourceIndex: selectedSourceIndex,
                    namespace: ns,
                }));
                if (selectedNamespace === ns) {
                    selectedNamespace = '';
                    selectedKey = '';
                }
            }
        });
    });

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

    list.innerHTML = keys.map(key => {
        const isActive = key === selectedKey;
        const translations = nsData[key] || {};
        // 显示第一个有值的翻译作为预览
        const preview = Object.values(translations).find(v => v) || '';
        return `<div class="key-item${isActive ? ' active' : ''}" data-key="${esc(key)}">
            <div class="key-item-name">${esc(key)}</div>
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

/** 渲染翻译编辑区 */
function renderEditor() {
    const titleEl = panelRef?.$['edit-title'] as HTMLElement;
    const body = panelRef?.$['edit-body'] as HTMLElement;
    const saveBtn = panelRef?.$['btn-save-key'] as HTMLButtonElement;
    const deleteBtn = panelRef?.$['btn-delete-key'] as HTMLButtonElement;
    if (!body) return;

    if (!selectedKey || !selectedNamespace) {
        if (titleEl) titleEl.textContent = '选择一个 Key 进行编辑';
        body.innerHTML = '<div class="empty-hint">← 从左侧选择一个 Key</div>';
        if (saveBtn) saveBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        return;
    }

    const data = getSourceData();
    if (!data) return;

    const translations = data[selectedNamespace]?.[selectedKey] || {};
    if (titleEl) titleEl.textContent = `${selectedNamespace}.${selectedKey}`;
    if (saveBtn) saveBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;

    // 确定要显示的语言
    let langs = payload?.languages || [];
    if (filterLang) {
        langs = langs.filter(l => l === filterLang);
    }

    body.innerHTML = langs.map(lang => {
        const value = translations[lang] || '';
        return `<div class="lang-editor">
            <div class="lang-editor-header">
                <span class="lang-editor-label">
                    ${esc(lang)}
                    ${lang === langs[0] && !filterLang ? '<span class="lang-editor-badge">主语言</span>' : ''}
                </span>
                <button class="lang-editor-remove" data-lang="${esc(lang)}" title="移除该语言">移除语言</button>
            </div>
            <textarea class="lang-textarea" data-lang="${esc(lang)}" placeholder="输入 ${esc(lang)} 翻译...">${esc(value)}</textarea>
        </div>`;
    }).join('');

    if (langs.length === 0) {
        body.innerHTML = '<div class="empty-hint">暂无语言<br>点击顶部「+ 语言」添加</div>';
    }

    // 移除语言按钮
    body.querySelectorAll('.lang-editor-remove').forEach((btn: Element) => {
        btn.addEventListener('click', () => {
            const lang = btn.getAttribute('data-lang')!;
            if (confirm(`确定移除语言 "${lang}" 的所有翻译？此操作不可撤销。`)) {
                Editor.Message.send('framework-plugin', 'i18n-remove-language', JSON.stringify({ langCode: lang }));
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

    // 数据源切换
    const sourceSel = this.$['source-selector'] as HTMLSelectElement;
    sourceSel?.addEventListener('change', () => {
        selectedSourceIndex = parseInt(sourceSel.value) || 0;
        selectedNamespace = '';
        selectedKey = '';
        renderNamespaces();
        renderKeys();
        renderEditor();
    });

    // 重新加载
    this.$['btn-reload']?.addEventListener('click', () => {
        Editor.Message.send('framework-plugin', 'i18n-load-data', '');
    });

    // 添加语言
    this.$['btn-add-lang']?.addEventListener('click', () => {
        const lang = prompt('请输入语言代码（如 en、ja、ko）：');
        if (lang?.trim()) {
            Editor.Message.send('framework-plugin', 'i18n-add-language', JSON.stringify({ langCode: lang.trim() }));
        }
    });

    // 添加命名空间
    this.$['btn-add-ns']?.addEventListener('click', () => {
        const ns = prompt('请输入命名空间名称：');
        if (ns?.trim()) {
            Editor.Message.send('framework-plugin', 'i18n-create-namespace', JSON.stringify({
                sourceIndex: selectedSourceIndex,
                namespace: ns.trim(),
            }));
        }
    });

    // 搜索
    const searchInput = this.$['key-search'] as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
        searchKeyword = searchInput.value;
        renderKeys();
    });

    // 添加 Key
    this.$['btn-add-key']?.addEventListener('click', () => {
        if (!selectedNamespace) {
            setStatus('请先选择命名空间');
            return;
        }
        const key = prompt(`在 "${selectedNamespace}" 中新建 Key：`);
        if (key?.trim()) {
            Editor.Message.send('framework-plugin', 'i18n-create-key', JSON.stringify({
                sourceIndex: selectedSourceIndex,
                namespace: selectedNamespace,
                key: key.trim(),
            }));
        }
    });

    // 语言过滤
    const langFilter = this.$['lang-filter'] as HTMLSelectElement;
    langFilter?.addEventListener('change', () => {
        filterLang = langFilter.value;
        renderEditor();
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
    this.$['btn-delete-key']?.addEventListener('click', () => {
        if (!selectedKey || !selectedNamespace) return;
        if (confirm(`确定删除 Key "${selectedNamespace}.${selectedKey}"？`)) {
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
}

export function close() {
    panelRef = null;
    payload = null;
    selectedSourceIndex = 0;
    selectedNamespace = '';
    selectedKey = '';
    searchKeyword = '';
    filterLang = '';
    renamingNs = '';
}

// ==================== 面板方法（接收消息） ====================

export const methods = {
    /** 接收完整 i18n 数据 */
    setI18nData(dataStr: string) {
        try {
            payload = JSON.parse(dataStr);
            if (!payload) return;

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
            renderLangFilter();
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
};
