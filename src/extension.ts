import * as vscode from "vscode";
import * as path from "path";
import { LineCountDecorationProvider } from "./lineCountDecorationProvider";

export function activate(context: vscode.ExtensionContext): void {
    const provider = new LineCountDecorationProvider();

    // Register the FileDecorationProvider
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(provider)
    );

    // Refresh decorations when a file is saved
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            provider.refreshUri(document.uri);
        })
    );

    // Refresh all decorations when configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("lineCounter")) {
                provider.refreshAll();
            }
        })
    );

    // Refresh decorations when files are created or deleted
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    context.subscriptions.push(
        watcher.onDidCreate((uri) => provider.refreshUri(uri))
    );
    context.subscriptions.push(
        watcher.onDidDelete((uri) => provider.refreshUri(uri))
    );
    context.subscriptions.push(
        watcher.onDidChange((uri) => provider.refreshUri(uri))
    );
    context.subscriptions.push(watcher);

    // Register the addToIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.addToIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeFolders: string[] = config.get("excludeFolders", []);

            // Get path relative to workspace root if possible
            let pathToAdd = uri.fsPath;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            if (workspaceFolder) {
                pathToAdd = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
            } else {
                pathToAdd = path.basename(uri.fsPath);
            }

            if (!excludeFolders.includes(pathToAdd)) {
                const updatedExcludes = [...excludeFolders, pathToAdd];
                await config.update("excludeFolders", updatedExcludes, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Added '${pathToAdd}' to Stanza ignore list.`);
            } else {
                vscode.window.showInformationMessage(`'${pathToAdd}' is already in the ignore list.`);
            }
        })
    );

    // Clean up provider on deactivation
    context.subscriptions.push(provider);
}

export function deactivate(): void {
    // Nothing to clean up — disposables handle it
}
