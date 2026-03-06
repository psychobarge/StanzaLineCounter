import * as vscode from "vscode";
import * as path from "path";
import {
    formatBadge,
    toBoldUnicode,
    countLines,
    countLinesStream,
    shouldExcludePath,
    isTooLarge,
    getDecorationSpec,
} from "./utils";


interface CacheEntry {
    lineCount: number;
    mtimeMs: number;
}

export class LineCountDecorationProvider
    implements vscode.FileDecorationProvider {
    private readonly _onDidChangeFileDecorations =
        new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    /** Cache: fsPath → { lineCount, mtimeMs } */
    private readonly cache = new Map<string, CacheEntry>();

    /** Set of fsPaths for files currently exceeding the line limit */
    private readonly exceededFiles = new Set<string>();

    // ─── Public API ─────────────────────────────────────────────

    async provideFileDecoration(
        uri: vscode.Uri,
        _token: vscode.CancellationToken
    ): Promise<vscode.FileDecoration | undefined> {
        // Read user settings
        const config = vscode.workspace.getConfiguration("lineCounter");
        const showFolderBadges: boolean = config.get("showFolderBadges", true);

        // Handle directories
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            return undefined;
        }

        if (stat.type === vscode.FileType.Directory) {
            if (!showFolderBadges) {
                return undefined;
            }
            // Check if any exceeded file is inside this directory
            const folderPath = uri.fsPath + path.sep;
            for (const exceededPath of this.exceededFiles) {
                if (exceededPath.startsWith(folderPath)) {
                    const limitColor: string = config.get("limitColor", "editorInfo.foreground");
                    return new vscode.FileDecoration(
                        "⚠",
                        "Contains files exceeding line limit",
                        new vscode.ThemeColor(limitColor)
                    );
                }
            }
            return undefined;
        }

        if (stat.type !== vscode.FileType.File) {
            return undefined;
        }

        const ext = path.extname(uri.fsPath);

        const excludeExtensions: string[] = config.get("excludeExtensions", []);
        const excludeFolders: string[] = config.get("excludeFolders", [
            "node_modules",
            ".git",
            "vendor",
            "dist",
            "out",
            "target",
            "bin",
            ".venv",
            "venv",
            "env",
            ".env",
        ]);
        const limit: number = config.get("limit", 300);
        const limitColor: string = config.get("limitColor", "editorInfo.foreground");
        const maxFileSizeMB: number = config.get("maxFileSizeMB", 10);
        const useSmileys: boolean = config.get("useSmileys", false);

        // Check for exclusions (folders or extensions)
        if (shouldExcludePath(uri.fsPath, excludeFolders, excludeExtensions)) {
            return undefined;
        }

        // Skip directories and other non-file entries
        if (stat.type !== vscode.FileType.File) {
            return undefined;
        }

        // Skip large files (to prevent performance issues/crashes)
        if (isTooLarge(stat.size, maxFileSizeMB)) {
            this.updateExceededStatus(uri, false);
            return undefined;
        }

        // Check cache
        const cached = this.cache.get(uri.fsPath);
        if (cached && cached.mtimeMs === stat.mtime) {
            this.updateExceededStatus(uri, cached.lineCount > limit);
            return this.buildDecoration(cached.lineCount, limit, limitColor, useSmileys);
        }

        // Read file and count lines
        let lineCount: number;
        try {
            if (uri.scheme === "file") {
                lineCount = await countLinesStream(uri.fsPath);
            } else {
                const content = await vscode.workspace.fs.readFile(uri);
                lineCount = countLines(content);
            }
        } catch {
            this.updateExceededStatus(uri, false);
            return undefined;
        }

        // Cache management: limit to 1000
        if (this.cache.size >= 1000) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        // Update cache
        this.cache.set(uri.fsPath, { lineCount, mtimeMs: stat.mtime });

        this.updateExceededStatus(uri, lineCount > limit);

        return this.buildDecoration(lineCount, limit, limitColor, useSmileys);
    }

    private updateExceededStatus(uri: vscode.Uri, isExceeded: boolean): void {
        const fsPath = uri.fsPath;
        const wasExceeded = this.exceededFiles.has(fsPath);

        if (isExceeded !== wasExceeded) {
            if (isExceeded) {
                this.exceededFiles.add(fsPath);
            } else {
                this.exceededFiles.delete(fsPath);
            }

            // Refresh all parent directories
            let parentPath = path.dirname(fsPath);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const rootPath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;

            while (parentPath && parentPath !== rootPath && parentPath !== path.dirname(parentPath)) {
                this._onDidChangeFileDecorations.fire(vscode.Uri.file(parentPath));
                parentPath = path.dirname(parentPath);
            }
            if (rootPath) {
                this._onDidChangeFileDecorations.fire(vscode.Uri.file(rootPath));
            }
        }
    }

    /** Refresh decoration for a specific URI (e.g. after file save). */
    refreshUri(uri: vscode.Uri): void {
        // Invalidate cache for this file so provideFileDecoration re-reads it
        this.cache.delete(uri.fsPath);
        // We don't delete from exceededFiles here because provideFileDecoration will update it
        this._onDidChangeFileDecorations.fire(uri);
    }

    /** Refresh all decorations (e.g. after config change). */
    refreshAll(): void {
        this.cache.clear();
        this.exceededFiles.clear();
        this._onDidChangeFileDecorations.fire(undefined);
        // Trigger a new warm-up
        this.warmUpWorkspace();
    }

    /** Proactively scan the workspace to find files exceeding the limit. */
    async warmUpWorkspace(): Promise<void> {
        const config = vscode.workspace.getConfiguration("lineCounter");

        const enableWorkspaceWarmUp: boolean = config.get("enableWorkspaceWarmUp", false);
        if (!enableWorkspaceWarmUp) {
            return;
        }

        const showFolderBadges: boolean = config.get("showFolderBadges", true);
        if (!showFolderBadges) {
            return;
        }

        const limit: number = config.get("limit", 300);
        const maxFileSizeMB: number = config.get("maxFileSizeMB", 10);
        const excludeExtensions: string[] = config.get("excludeExtensions", []);
        const excludeFolders: string[] = config.get("excludeFolders", [
            "node_modules",
            ".git",
            "vendor",
            "dist",
            "out",
            "target",
            "bin",
            ".venv",
            "venv",
            "env",
            ".env",
        ]);

        try {
            // Find all files in the workspace, excluding common large folders initially for speed
            const excludePattern = "**/{node_modules,.git,out,dist,build,vendor}/**";
            const files = await vscode.workspace.findFiles("**/*", excludePattern);

            // Process in chunks to avoid blocking the extension host
            const chunkSize = 50;
            for (let i = 0; i < files.length; i += chunkSize) {
                const chunk = files.slice(i, i + chunkSize);

                await Promise.all(chunk.map(async (uri) => {
                    // Re-check detailed exclusions
                    if (shouldExcludePath(uri.fsPath, excludeFolders, excludeExtensions)) {
                        return;
                    }

                    try {
                        const stat = await vscode.workspace.fs.stat(uri);
                        if (isTooLarge(stat.size, maxFileSizeMB)) {
                            return;
                        }

                        let lineCount: number;
                        if (uri.scheme === "file") {
                            lineCount = await countLinesStream(uri.fsPath);
                        } else {
                            const content = await vscode.workspace.fs.readFile(uri);
                            lineCount = countLines(content);
                        }

                        // Cache management: limit to 1000
                        if (this.cache.size >= 1000) {
                            const firstKey = this.cache.keys().next().value;
                            if (firstKey) {
                                this.cache.delete(firstKey);
                            }
                        }

                        // Seed cache
                        this.cache.set(uri.fsPath, { lineCount, mtimeMs: stat.mtime });

                        if (lineCount > limit) {
                            // Update exceeded status directly to avoid unnecessary re-reads
                            const fsPath = uri.fsPath;
                            if (!this.exceededFiles.has(fsPath)) {
                                this.exceededFiles.add(fsPath);

                                // Refresh all parent directories
                                let parentPath = path.dirname(fsPath);
                                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                                const rootPath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;

                                while (parentPath && parentPath !== rootPath && parentPath !== path.dirname(parentPath)) {
                                    this._onDidChangeFileDecorations.fire(vscode.Uri.file(parentPath));
                                    parentPath = path.dirname(parentPath);
                                }
                                if (rootPath) {
                                    this._onDidChangeFileDecorations.fire(vscode.Uri.file(rootPath));
                                }
                            }
                        }
                    } catch {
                        // Ignore errors reading individual files during warmup
                    }
                }));

                // Yield to event loop
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        } catch (error) {
            console.error("StanzaLineCounter: Error during workspace warmup", error);
        }
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }

    // ─── Internals ──────────────────────────────────────────────

    private buildDecoration(
        lineCount: number,
        limit: number,
        limitColor: string,
        useSmileys: boolean
    ): vscode.FileDecoration {
        const spec = getDecorationSpec(lineCount, limit, useSmileys);
        const color = spec.useLimitColor
            ? new vscode.ThemeColor(limitColor)
            : undefined;

        return new vscode.FileDecoration(spec.badge, spec.tooltip, color);
    }
}

