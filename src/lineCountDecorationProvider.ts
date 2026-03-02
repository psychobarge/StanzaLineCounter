import * as vscode from "vscode";
import * as path from "path";

interface CacheEntry {
    lineCount: number;
    mtimeMs: number;
}

/**
 * Formats a line count into a short badge string (max 2 chars).
 *
 *   0–99   → as-is   ("42")
 *   100–999 → Xc      ("3c" ≈ 300)
 *   1 000–9 999 → Xk  ("1k")
 *   10 000+ → XXk     ("15k")
 */
function formatBadge(lineCount: number): string {
    if (lineCount < 100) {
        return String(lineCount);
    }
    if (lineCount < 1000) {
        return `${Math.floor(lineCount / 100)}c`;
    }
    if (lineCount < 10000) {
        return `${Math.floor(lineCount / 1000)}k`;
    }
    return `${Math.floor(lineCount / 1000)}k`;
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
        const excludeExtensions: string[] = config.get("excludeExtensions", [
            ".log",
            ".min.js",
            ".map",
        ]);
        const limit: number = config.get("limit", 300);

        // Check excluded extensions
        if (ext && excludeExtensions.includes(ext)) {
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

        // Check cache
        const cached = this.cache.get(uri.fsPath);
        if (cached && cached.mtimeMs === stat.mtime) {
            return this.buildDecoration(cached.lineCount, limit);
        }

        // Read file and count lines
        let lineCount: number;
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            lineCount = this.countLines(content);
        } catch {
            return undefined;
        }

        // Update cache
        this.cache.set(uri.fsPath, { lineCount, mtimeMs: stat.mtime });

        return this.buildDecoration(lineCount, limit);
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
        limit: number
    ): vscode.FileDecoration {
        const badge = formatBadge(lineCount);
        const tooltip = `${lineCount} lines`;
        const color =
            lineCount > limit
                ? new vscode.ThemeColor("editorWarning.foreground")
                : undefined;

        return new vscode.FileDecoration(badge, tooltip, color);
    }

    private countLines(content: Uint8Array): number {
        if (content.length === 0) {
            return 0;
        }
        let count = 1; // At least one line if file is non-empty
        for (let i = 0; i < content.length; i++) {
            if (content[i] === 0x0a) {
                // newline character
                count++;
            }
        }
        // If the file ends with a newline, don't count the trailing empty "line"
        if (content[content.length - 1] === 0x0a) {
            count--;
        }
        return count;
    }
}
