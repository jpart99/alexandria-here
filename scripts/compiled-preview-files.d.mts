export declare function ensureContainedDirectory(boundary: string, candidate: string): Promise<string>;
export declare function createFreshPreviewConfigDirectory(scratchRoot: string): Promise<string>;
export declare function writeExclusivePreviewConfig(configPath: string, contents: string): Promise<void>;
