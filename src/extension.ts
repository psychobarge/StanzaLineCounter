import * as vscode from "vscode";
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

    // Clean up provider on deactivation
    context.subscriptions.push(provider);
}

export function deactivate(): void {
    // Nothing to clean up — disposables handle it
}
