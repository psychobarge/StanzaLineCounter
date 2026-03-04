import * as vscode from "vscode";
import * as path from "path";
import {
    formatBadge,
    toBoldUnicode,
    countLines,
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

    // ─── Public API ─────────────────────────────────────────────

    async provideFileDecoration(
        uri: vscode.Uri,
        _token: vscode.CancellationToken
    ): Promise<vscode.FileDecoration | undefined> {
        // Only handle file:// scheme
        if (uri.scheme !== "file") {
            return undefined;
        }

        // Skip directories (quick heuristic: no extension → likely a directory)
        // The actual stat check below will also catch directories.
        const ext = path.extname(uri.fsPath);

        // Read user settings
        const config = vscode.workspace.getConfiguration("lineCounter");
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

        // Check for exclusions (folders or extensions)
        if (shouldExcludePath(uri.fsPath, excludeFolders, excludeExtensions)) {
            return undefined;
        }

        // Stat the file to determine if it's a file and get mtime
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch {
            return undefined;
        }

        // Skip directories and other non-file entries
        if (stat.type !== vscode.FileType.File) {
            return undefined;
        }

        // Skip large files (to prevent performance issues/crashes)
        if (isTooLarge(stat.size, maxFileSizeMB)) {
            return undefined;
        }

        // Check cache
        const cached = this.cache.get(uri.fsPath);
        if (cached && cached.mtimeMs === stat.mtime) {
            return this.buildDecoration(cached.lineCount, limit, limitColor);
        }

        // Read file and count lines
        let lineCount: number;
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            lineCount = countLines(content);
        } catch {
            return undefined;
        }

        // Update cache
        this.cache.set(uri.fsPath, { lineCount, mtimeMs: stat.mtime });

        return this.buildDecoration(lineCount, limit, limitColor);
    }

    /** Refresh decoration for a specific URI (e.g. after file save). */
    refreshUri(uri: vscode.Uri): void {
        // Invalidate cache for this file so provideFileDecoration re-reads it
        this.cache.delete(uri.fsPath);
        this._onDidChangeFileDecorations.fire(uri);
    }

    /** Refresh all decorations (e.g. after config change). */
    refreshAll(): void {
        this.cache.clear();
        this._onDidChangeFileDecorations.fire(undefined);
    }

    dispose(): void {
        this._onDidChangeFileDecorations.dispose();
    }

    // ─── Internals ──────────────────────────────────────────────

    private buildDecoration(
        lineCount: number,
        limit: number,
        limitColor: string
    ): vscode.FileDecoration {
        const spec = getDecorationSpec(lineCount, limit);
        const color = spec.useLimitColor
            ? new vscode.ThemeColor(limitColor)
            : undefined;

        return new vscode.FileDecoration(spec.badge, spec.tooltip, color);
    }
}

