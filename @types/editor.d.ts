/**
 * Cocos Creator Editor API 类型声明
 * 仅声明本插件使用到的 API
 */

declare namespace Editor {
    namespace Project {
        const path: string;
    }

    namespace Panel {
        function open(panelId: string): Promise<void>;
        function close(panelId: string): void;
    }

    namespace Message {
        function send(extensionName: string, message: string, ...args: any[]): void;
        function request(extensionName: string, message: string, ...args: any[]): Promise<any>;
    }

    namespace Dialog {
        function info(message: string, options?: DialogOptions): Promise<DialogResult>;
        function warn(message: string, options?: DialogOptions): Promise<DialogResult>;
        function error(message: string, options?: DialogOptions): Promise<DialogResult>;
        function select(options?: SelectDialogOptions): Promise<OpenDialogReturnValue>;
        function save(options?: SaveDialogOptions): Promise<SaveDialogReturnValue>;
    }

    interface DialogOptions {
        title?: string;
        detail?: string;
        buttons?: string[];
        default?: number;
        cancel?: number;
    }

    interface DialogResult {
        response: number;
    }

    interface SelectDialogOptions {
        title?: string;
        path?: string;
        type?: 'directory' | 'file';
        multi?: boolean;
        filters?: Array<{ name: string; extensions: string[] }>;
    }

    interface OpenDialogReturnValue {
        canceled: boolean;
        filePaths: string[];
    }

    interface SaveDialogOptions {
        title?: string;
        path?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
    }

    interface SaveDialogReturnValue {
        canceled: boolean;
        filePath?: string;
    }
}
