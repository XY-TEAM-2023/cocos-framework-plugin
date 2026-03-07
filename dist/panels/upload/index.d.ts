/**
 * 上传到 R2 - 面板
 *
 * 功能：
 *   - 树形多选：platform > bundleName / version
 *   - 上传进度反馈（进度条 + 文件状态）
 *   - 取消上传按钮
 *   - 锁定/解锁状态切换
 */
export declare const template = "\n<div id=\"upload-panel\" style=\"display: flex; flex-direction: column; height: 100%; background: #1e1e1e; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 12px;\">\n    <!-- Header -->\n    <div style=\"display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #2d2d2d; border-bottom: 1px solid #404040;\">\n        <span id=\"panel-title\" style=\"font-weight: bold; color: #569cd6;\">\u2601\uFE0F \u4E0A\u4F20\u5230 R2</span>\n        <div style=\"display: flex; gap: 6px;\">\n            <button id=\"btn-select-all\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 11px;\">\u5168\u9009</button>\n            <button id=\"btn-deselect-all\" style=\"background: #404040; color: #d4d4d4; border: 1px solid #555; border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 11px;\">\u53D6\u6D88\u5168\u9009</button>\n        </div>\n    </div>\n\n    <!-- Hint -->\n    <div style=\"padding: 4px 12px; font-size: 11px; color: #666; background: #252525; border-bottom: 1px solid #333;\">\uD83D\uDCA1 \u4EC5\u663E\u793A\u6700\u540E\u4E00\u6B21\u6784\u5EFA\u7684\u7248\u672C</div>\n\n    <!-- Tree -->\n    <div id=\"tree-container\" style=\"flex: 1; overflow-y: auto; padding: 8px 12px; line-height: 2;\"></div>\n\n    <!-- Progress area -->\n    <div id=\"progress-container\" style=\"padding: 8px 12px; background: #252525; border-top: 1px solid #404040;\">\n        <div style=\"display: flex; justify-content: space-between; margin-bottom: 4px;\">\n            <span id=\"progress-text\" style=\"color: #569cd6;\">\u5C31\u7EEA</span>\n            <span id=\"status-text\" style=\"color: #6a9955;\"></span>\n        </div>\n        <div style=\"width: 100%; height: 6px; background: #3c3c3c; border-radius: 3px; overflow: hidden;\">\n            <div id=\"progress-bar\" style=\"width: 0%; height: 100%; background: #0e639c; border-radius: 3px; transition: width 0.3s ease;\"></div>\n        </div>\n        <div id=\"upload-log\" style=\"max-height: 120px; overflow-y: auto; margin-top: 6px; font-size: 11px; color: #888;\"></div>\n    </div>\n\n    <!-- Buttons -->\n    <div style=\"display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px; background: #2d2d2d; border-top: 1px solid #404040;\">\n        <button id=\"btn-cancel\" style=\"display: none; background: #a1260d; color: #fff; border: none; border-radius: 3px; padding: 6px 14px; cursor: pointer; font-size: 12px;\">\u53D6\u6D88\u4E0A\u4F20</button>\n        <button id=\"btn-upload\" style=\"background: #0e639c; color: #fff; border: none; border-radius: 3px; padding: 6px 16px; cursor: pointer; font-size: 12px;\">\u5F00\u59CB\u4E0A\u4F20</button>\n    </div>\n</div>\n";
export declare const style = "\n#upload-panel ::-webkit-scrollbar {\n    width: 8px;\n}\n#upload-panel ::-webkit-scrollbar-track {\n    background: #1e1e1e;\n}\n#upload-panel ::-webkit-scrollbar-thumb {\n    background: #555;\n    border-radius: 4px;\n}\n#upload-panel ::-webkit-scrollbar-thumb:hover {\n    background: #777;\n}\n.tree-platform {\n    margin-bottom: 6px;\n}\n.tree-platform-label {\n    font-weight: bold;\n    color: #dcdcaa;\n    cursor: pointer;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n}\n.tree-bundle {\n    margin-left: 20px;\n    padding: 2px 0;\n    display: flex;\n    align-items: center;\n    gap: 6px;\n}\n.tree-bundle label {\n    cursor: pointer;\n    color: #d4d4d4;\n}\n.tree-bundle label:hover {\n    color: #fff;\n}\ninput[type=\"checkbox\"] {\n    accent-color: #0e639c;\n    cursor: pointer;\n}\n";
export declare const $: {
    'tree-container': string;
    'progress-container': string;
    'progress-bar': string;
    'progress-text': string;
    'status-text': string;
    'btn-upload': string;
    'btn-cancel': string;
    'btn-select-all': string;
    'btn-deselect-all': string;
    'panel-title': string;
};
export declare function ready(this: any): void;
export declare function close(): void;
export declare const methods: {
    /**
     * 设置树形数据并渲染 checkbox
     * data 格式：{ platform: string, bundleName: string, version: string }[]
     */
    setTreeData(dataStr: string): void;
    /**
     * 更新上传进度
     */
    updateProgress(dataStr: string): void;
    /**
     * 切换上传/选择模式
     */
    setUploading(isUploading: string): void;
    /**
     * 设置完成状态
     */
    setComplete(message: string): void;
    /**
     * 设置错误状态
     */
    setError(message: string): void;
};
