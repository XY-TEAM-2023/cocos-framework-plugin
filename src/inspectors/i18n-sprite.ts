/**
 * I18nSprite 自定义 Inspector 面板
 *
 * 提供两种模式 UI：
 * - 约定路径：填 basePath / bundleName，运行时按 ${basePath}_{lang}/spriteFrame 加载
 * - 手动绑定：每行一个语言下拉框 + SpriteFrame 选择控件（cocos 默认控件）
 *
 * 架构（与 i18n-label / i18n-editbox 一致）：
 * - 模块级共享只读：i18n 数据快照（仅 languages + primaryLang），由 main.ts 推送
 * - 实例级独立状态：每个 inspector 实例的状态挂在 `panelThis._inst`
 * - SpriteFrame 字段通过 <ui-prop type="dump" no-label>.render(dump) 复用 cocos 默认渲染
 */

'use strict';

const LOG_TAG = '[I18nSprite-Inspector]';

// ==================== 模块级：快照 ====================

interface SpriteSnapshot {
    languages: string[];
    primaryLang: string;
    version: number;
}

let snapshot: SpriteSnapshot = {
    languages: [],
    primaryLang: 'zh',
    version: -1,
};

let snapshotLoading: Promise<void> | null = null;
const liveInstances = new Set<any>();
let broadcastRegistered = false;

const onI18nDataChanged = (_v?: number) => {
    void refreshSnapshot(true);
};

async function refreshSnapshot(force: boolean = false): Promise<void> {
    if (snapshotLoading && !force) return snapshotLoading;
    snapshotLoading = (async () => {
        try {
            // @ts-ignore
            const data = await Editor.Message.request('framework-plugin', 'i18n-get-snapshot');
            if (data) {
                snapshot = {
                    languages: data.languages || [],
                    primaryLang: data.primaryLang || 'zh',
                    version: data.version || 0,
                };
                liveInstances.forEach(self => {
                    try { renderAll(self); } catch {}
                });
            }
        } catch (e) {
            console.warn(`${LOG_TAG} 拉取快照失败:`, e);
        } finally {
            snapshotLoading = null;
        }
    })();
    return snapshotLoading;
}

// ==================== 实例级状态 ====================

interface InstState {
    dump: any;
}

function getInst(self: any): InstState {
    if (!self._inst) {
        self._inst = { dump: null } as InstState;
    }
    return self._inst as InstState;
}

// ==================== 模板 ====================

export const template = `
<div class="i18n-sprite-inspector">
    <ui-prop>
        <ui-label slot="label" tooltip="约定路径模式：basePath_{lang}/spriteFrame 自动加载；非空时优先于下方 Entries">基础路径</ui-label>
        <div slot="content">
            <input id="base-path" type="text" placeholder='留空使用下方手动绑定' />
        </div>
    </ui-prop>
    <ui-prop>
        <ui-label slot="label" tooltip="约定路径模式下加载资源所在 Bundle，留空使用 resources">Bundle</ui-label>
        <div slot="content">
            <input id="bundle-name" type="text" placeholder="留空使用 resources" />
        </div>
    </ui-prop>
    <div id="path-hint" class="path-hint" hidden>
        <span class="hint-icon">💡</span>
        <span>运行时自动加载 <code id="path-example">basePath_{lang}/spriteFrame</code></span>
    </div>
    <div id="entries-section" class="entries-section"></div>
</div>
`;

export const style = `
.i18n-sprite-inspector { padding: 4px 0; }
.i18n-sprite-inspector input[type="text"] {
    width: 100%; box-sizing: border-box;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none;
}
.i18n-sprite-inspector input[type="text"]:focus { border-color: #007ACC; }
.path-hint {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; margin: 6px 0;
    background: #1a2a1a; border-radius: 4px;
    font-size: 11px; color: #6a6;
}
.path-hint code {
    background: #232323; padding: 1px 4px; border-radius: 3px;
    font-family: 'SF Mono', Menlo, monospace; color: #4ec9b0;
}
.hint-icon { font-size: 13px; }
.entries-section { margin-top: 4px; }
.entries-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 0 4px;
}
.entries-title {
    font-size: 11px; color: #888; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.entries-add-btn {
    background: none; border: 1px solid #444; color: #888;
    border-radius: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer;
}
.entries-add-btn:hover { background: #333; color: #ccc; }
.entries-list {}
.entry-row {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 0;
}
.entry-row + .entry-row { border-top: 1px solid #1e1e1e; }
.entry-lang-select {
    flex-shrink: 0; min-width: 84px; height: 24px;
    background: #232323; border: 1px solid #444; color: #ccc;
    border-radius: 3px; padding: 0 6px; font-size: 12px; outline: none;
    font-family: 'SF Mono', Menlo, monospace;
}
.entry-lang-select:focus { border-color: #007ACC; }
.entry-sprite-wrap {
    flex: 1; min-width: 0;
}
.entry-sprite-wrap ui-prop { display: block; }
.entry-delete-btn {
    flex-shrink: 0; background: none; border: none; color: #444;
    cursor: pointer; font-size: 12px; padding: 0 4px;
    transition: color 0.15s;
}
.entry-delete-btn:hover { color: #e44; }
.entries-empty {
    padding: 8px; text-align: center; font-size: 11px;
    color: #4a4a4a; font-style: italic;
    background: #1a1a1a; border-radius: 3px;
}
.entries-disabled-warn {
    padding: 4px 8px; margin: 4px 0;
    background: #2a2418; border-radius: 4px;
    font-size: 11px; color: #c89042;
}
`;

export const $ = {
    'base-path': '#base-path',
    'bundle-name': '#bundle-name',
    'path-hint': '#path-hint',
    'path-example': '#path-example',
    'entries-section': '#entries-section',
};

// ==================== 生命周期 ====================

export function ready(this: any) {
    liveInstances.add(this);

    if (!broadcastRegistered) {
        try {
            // @ts-ignore
            Editor.Message.addBroadcastListener('framework-plugin:i18n-data-changed', onI18nDataChanged);
            broadcastRegistered = true;
        } catch (e) {
            console.warn(`${LOG_TAG} 注册 broadcast 监听失败:`, e);
        }
    }
    if (snapshot.version < 0) void refreshSnapshot();

    const basePathInput = this.$['base-path'] as HTMLInputElement;
    const bundleNameInput = this.$['bundle-name'] as HTMLInputElement;

    basePathInput?.addEventListener('change', () => {
        const inst = getInst(this);
        if (inst.dump?.value?.basePath) {
            inst.dump.value.basePath.value = basePathInput.value.trim();
            commitProperty(this, 'basePath');
        }
        renderAll(this);
    });

    bundleNameInput?.addEventListener('change', () => {
        const inst = getInst(this);
        if (inst.dump?.value?.bundleName) {
            inst.dump.value.bundleName.value = bundleNameInput.value.trim();
            commitProperty(this, 'bundleName');
        }
    });
}

export function update(this: any, dump: any) {
    const inst = getInst(this);
    inst.dump = dump;
    if (!dump || !dump.value) return;
    renderAll(this);
}

export function close(this: any) {
    liveInstances.delete(this);
}

// ==================== 渲染 ====================

function renderAll(self: any) {
    const inst = getInst(self);
    if (!inst.dump?.value) return;

    const basePathInput = self.$['base-path'] as HTMLInputElement;
    const bundleNameInput = self.$['bundle-name'] as HTMLInputElement;

    if (basePathInput && document.activeElement !== basePathInput) {
        basePathInput.value = inst.dump.value.basePath?.value || '';
    }
    if (bundleNameInput && document.activeElement !== bundleNameInput) {
        bundleNameInput.value = inst.dump.value.bundleName?.value || '';
    }

    updatePathHint(self);
    renderEntries(self);
}

function updatePathHint(self: any) {
    const inst = getInst(self);
    const hint = self.$['path-hint'] as HTMLElement;
    const example = self.$['path-example'] as HTMLElement;
    if (!hint || !example) return;

    const basePath = inst.dump?.value?.basePath?.value || '';
    if (basePath) {
        hint.removeAttribute('hidden');
        example.textContent = `${basePath}_{lang}/spriteFrame`;
    } else {
        hint.setAttribute('hidden', '');
    }
}

function renderEntries(self: any) {
    const inst = getInst(self);
    const section = self.$['entries-section'] as HTMLElement;
    if (!section) return;

    const entriesDump = inst.dump?.value?.entries;
    const entries: any[] = entriesDump?.value || [];
    const hasBasePath = !!inst.dump?.value?.basePath?.value;

    let html = '<div class="entries-header">';
    html += '<span class="entries-title">手动绑定 Entries</span>';
    html += '<button class="entries-add-btn" id="inner-btn-add-entry">+ 添加项</button>';
    html += '</div>';

    if (hasBasePath) {
        html += '<div class="entries-disabled-warn">⚠ Base Path 非空，下方 Entries 不生效（约定路径模式优先）</div>';
    }

    if (entries.length === 0) {
        html += '<div class="entries-empty">无项；点击右上角"+ 添加项"开始绑定</div>';
    } else {
        html += '<div class="entries-list" id="inner-entries-list"></div>';
    }

    section.innerHTML = html;

    // 添加项按钮
    section.querySelector('#inner-btn-add-entry')?.addEventListener('click', () => {
        addEntry(self);
    });

    // 渲染每行
    if (entries.length > 0) {
        const listEl = section.querySelector('#inner-entries-list') as HTMLElement;
        entries.forEach((entry: any, idx: number) => {
            const row = buildEntryRow(self, entry, idx);
            listEl.appendChild(row);
        });
    }
}

function buildEntryRow(self: any, entry: any, idx: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'entry-row';

    // 1. lang 下拉框
    const langSelect = document.createElement('select');
    langSelect.className = 'entry-lang-select';
    const currentLang = entry?.value?.lang?.value || '';
    fillLangOptions(langSelect, currentLang);
    langSelect.addEventListener('change', () => {
        const inst = getInst(self);
        const entries = inst.dump?.value?.entries?.value;
        if (entries?.[idx]?.value?.lang) {
            entries[idx].value.lang.value = langSelect.value;
        }
        // 用精确路径写 lang 字段，避免被 cocos 数组合并行为吞掉
        void setEntryLang(self, idx, langSelect.value);
    });
    row.appendChild(langSelect);

    // 2. SpriteFrame 字段（cocos 默认控件）
    const sfWrap = document.createElement('div');
    sfWrap.className = 'entry-sprite-wrap';
    const sfDump = entry?.value?.spriteFrame;
    if (sfDump) {
        const sfProp = document.createElement('ui-prop') as any;
        sfProp.setAttribute('type', 'dump');
        sfProp.setAttribute('no-label', '');
        try {
            sfProp.render(sfDump);
        } catch (e) {
            console.warn(`${LOG_TAG} render spriteFrame 失败:`, e);
        }
        sfProp.addEventListener('change-dump', () => {
            commitProperty(self, 'entries');
        });
        sfWrap.appendChild(sfProp);
    }
    row.appendChild(sfWrap);

    // 3. 删除按钮
    const delBtn = document.createElement('button');
    delBtn.className = 'entry-delete-btn';
    delBtn.title = '删除该项';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
        removeEntry(self, idx);
    });
    row.appendChild(delBtn);

    return row;
}

function fillLangOptions(select: HTMLSelectElement, currentLang: string) {
    const langs = snapshot.languages.length > 0 ? snapshot.languages.slice() : [];
    // 主语言置顶
    langs.sort((a, b) => {
        if (a === snapshot.primaryLang) return -1;
        if (b === snapshot.primaryLang) return 1;
        return a.localeCompare(b);
    });
    // 当前语言不在 snapshot 中（比如 i18n 数据未加载、或用户填了未注册的语言），保留显示
    if (currentLang && !langs.includes(currentLang)) {
        langs.unshift(currentLang);
    }
    if (langs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(无可选语言)';
        select.appendChild(opt);
        return;
    }
    // 默认 / fallback 槽位（lang=""）：当 currentLang/primaryLang 都未命中时，运行时会用这一项
    // 显式提供该选项，避免 currentLang="" 时 <select> 默认选中第一项造成"假装选了主语言"的视觉假象
    {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '（默认 / fallback）';
        if (currentLang === '') opt.selected = true;
        select.appendChild(opt);
    }
    for (const lang of langs) {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = lang === snapshot.primaryLang ? `${lang}（主）` : lang;
        if (lang === currentLang) opt.selected = true;
        select.appendChild(opt);
    }
}

async function addEntry(self: any) {
    const inst = getInst(self);
    const entriesDump = inst.dump?.value?.entries;
    if (!entriesDump) return;
    const entries: any[] = entriesDump.value;

    // 选个未占用的语言
    const usedLangs = new Set(entries.map((e: any) => e?.value?.lang?.value).filter(Boolean));
    let candidate = snapshot.languages.find(l => !usedLangs.has(l));
    if (!candidate) candidate = snapshot.primaryLang || 'zh';

    const newIdx = entries.length;
    entries.push({
        value: {
            lang: { value: candidate },
            spriteFrame: { value: { uuid: '' } },
        },
    });
    await commitProperty(self, 'entries');
    // 数组 push 走 set-property 整体提交时，cocos 可能用 elementType 默认值覆盖 lang 字段，
    // 这里再用精确路径写一次 lang，确保持久化
    await setEntryLang(self, newIdx, candidate);
    renderEntries(self);
}

function removeEntry(self: any, idx: number) {
    const inst = getInst(self);
    const entries = inst.dump?.value?.entries?.value;
    if (!entries) return;
    entries.splice(idx, 1);
    commitProperty(self, 'entries');
    renderEntries(self);
}

// ==================== Scene API ====================

/**
 * 用精确路径单独写 entries[idx].lang 字段
 * 绕过数组整体 commit 时 cocos 用 elementType 默认值覆盖 lang 字段的行为
 */
async function setEntryLang(self: any, idx: number, lang: string): Promise<void> {
    const inst = getInst(self);
    const dump = inst.dump;
    if (!dump) return;

    // @ts-ignore
    const nodeUuids = Editor.Selection.getSelected('node');
    const nodeUuid = nodeUuids?.[0] || '';
    if (!nodeUuid) return;

    const langPath = `${dump.path || ''}.entries.${idx}.lang`;
    try {
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: langPath,
            dump: { type: 'String', value: lang },
        });
    } catch (e) {
        console.warn(`${LOG_TAG} setEntryLang(${idx}, ${lang}) 失败:`, e);
    }
}

async function commitProperty(self: any, propertyName: string): Promise<void> {
    const inst = getInst(self);
    const dump = inst.dump;
    const propDump = dump?.value?.[propertyName];
    if (!propDump) return;

    // @ts-ignore
    const nodeUuids = Editor.Selection.getSelected('node');
    const nodeUuid = nodeUuids?.[0] || '';
    if (!nodeUuid) {
        try { self.dispatch('change-dump'); } catch {}
        return;
    }

    const propertyPath = propDump.path || `${dump.path || ''}.${propertyName}`;
    try {
        // @ts-ignore
        await Editor.Message.request('scene', 'set-property', {
            uuid: nodeUuid,
            path: propertyPath,
            dump: {
                type: propDump.type,
                value: propDump.value,
                isArray: propDump.isArray,
            },
        });
    } catch (e) {
        console.error(`${LOG_TAG} commitProperty(${propertyName}) 失败:`, e);
        try { self.dispatch('change-dump'); } catch {}
    }
}
