/**
 * Build Hooks — onAfterBuild
 *
 * 构建完成后扫描 remote 产物目录，为每个 bundle 生成 manifest.json：
 *   - 文件列表（相对路径、大小、SHA-256 哈希）
 *   - 汇总信息（文件数、总字节、哈希算法）
 *   - 入口信息（bundleName、entryScene）
 *   - 构建时间版本号（中国时间 yyMMddHHmmss）
 *   - ed25519 签名
 */
interface IBuildTaskOptions {
    buildPath: string;
    outputName: string;
    startScene: string;
    scenes: Array<{
        url: string;
        uuid: string;
    }>;
    [key: string]: any;
}
interface IBuildResult {
    dest: string;
    [key: string]: any;
}
export declare function onAfterBuild(options: IBuildTaskOptions, result?: IBuildResult): Promise<void>;
export {};
