export interface PreviewArgumentOptions {
  root: string;
}

export declare function isPathContained(parentPath: string, candidatePath: string): boolean;
export declare function normalizePreviewArguments(arguments_: string[], options: PreviewArgumentOptions): string[];
export declare function rebaseWranglerConfig<T>(config: T, sourceConfigPath: string): T & { send_metrics: false };
export declare function previewEnvironment(environment: Record<string, string | undefined>): Record<string, string | undefined>;
