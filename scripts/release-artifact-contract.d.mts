export interface ArtifactPathOptions {
  symbolicLink?: boolean;
}

export declare function forbiddenArtifactReason(relativePath: string, options?: ArtifactPathOptions): string | null;
export declare function isForbiddenArtifactPath(relativePath: string, options?: ArtifactPathOptions): boolean;
