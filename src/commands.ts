import * as path from "path";
import * as vscode from "vscode";
import { getExtensionLimit, getPathExtension } from "./utils";
import { generateReport } from "./reportGenerator";

interface ExtensionLimitEntry {
    extension: string;
    limit: number;
}

interface DecorationProviderLike {
    refreshAll(): void;
    warmUpWorkspace(trigger?: "startup" | "config-change" | "manual"): Promise<void>;
}

type UpdateIgnoreMenuContexts = () => Promise<void>;

function normalizePathForComparison(value: string): string {
    return value.replace(/\\/g, "/").toLowerCase();
}

function isExtensionLimitEntry(value: unknown): value is ExtensionLimitEntry {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value as { extension?: unknown; limit?: unknown };
    return typeof candidate.extension === "string" && typeof candidate.limit === "number";
}

export function registerCommands(
    context: vscode.ExtensionContext,
    provider: DecorationProviderLike,
    updateIgnoreMenuContexts: UpdateIgnoreMenuContexts,
): void {
    // Register the addToIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.addToIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeFolders: string[] = config.get("excludeFolders", []);

            // Get path relative to workspace root if possible
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const pathToAdd = workspaceFolder
                ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
                : path.basename(uri.fsPath);

            if (!excludeFolders.includes(pathToAdd)) {
                const updatedExcludes = [...excludeFolders, pathToAdd];
                await config.update("excludeFolders", updatedExcludes, vscode.ConfigurationTarget.Global);
                await updateIgnoreMenuContexts();
                vscode.window.showInformationMessage(`Added '${pathToAdd}' to Stanza ignore list.`);
            } else {
                vscode.window.showInformationMessage(`'${pathToAdd}' is already in the ignore list.`);
            }
        }),
    );

    // Register the addExtensionToIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.addExtensionToIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const fileExtension = getPathExtension(uri.fsPath).toLowerCase();
            if (!fileExtension) {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeExtensions: string[] = config.get("excludeExtensions", []);
            const alreadyIgnored = excludeExtensions.some((extension) => extension.toLowerCase() === fileExtension);

            if (alreadyIgnored) {
                vscode.window.showInformationMessage(`'${fileExtension}' is already in the extension ignore list.`);
                return;
            }

            const updatedExcludeExtensions = [...excludeExtensions, fileExtension];
            await config.update("excludeExtensions", updatedExcludeExtensions, vscode.ConfigurationTarget.Global);
            await updateIgnoreMenuContexts();
            vscode.window.showInformationMessage(`Added '${fileExtension}' to Stanza extension ignore list.`);
        }),
    );

    // Register the removeExtensionFromIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.removeExtensionFromIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const fileExtension = getPathExtension(uri.fsPath).toLowerCase();
            if (!fileExtension) {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeExtensions: string[] = config.get("excludeExtensions", []);
            const hasMatch = excludeExtensions.some((extension) => extension.toLowerCase() === fileExtension);

            if (!hasMatch) {
                vscode.window.showInformationMessage(`'${fileExtension}' is not in the extension ignore list.`);
                return;
            }

            const updatedExcludeExtensions = excludeExtensions.filter(
                (extension) => extension.toLowerCase() !== fileExtension,
            );
            await config.update("excludeExtensions", updatedExcludeExtensions, vscode.ConfigurationTarget.Global);
            await updateIgnoreMenuContexts();
            provider.refreshAll();
            vscode.window.showInformationMessage(`Removed '${fileExtension}' from Stanza extension ignore list.`);
        }),
    );

    // Register the removeFromIgnoreList command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.removeFromIgnoreList", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const excludeFolders: string[] = config.get("excludeFolders", []);

            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
            const pathToRemove = workspaceFolder
                ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
                : path.basename(uri.fsPath);
            const normalizedTarget = normalizePathForComparison(pathToRemove);

            const entryIndex = excludeFolders.findIndex(
                (entry) => normalizePathForComparison(entry) === normalizedTarget,
            );

            if (entryIndex === -1) {
                vscode.window.showInformationMessage(`'${pathToRemove}' is not in the ignore list.`);
                return;
            }

            const removedEntry = excludeFolders[entryIndex];
            const updatedExcludes = excludeFolders.filter((_, index) => index !== entryIndex);
            await config.update("excludeFolders", updatedExcludes, vscode.ConfigurationTarget.Global);
            await updateIgnoreMenuContexts();
            provider.refreshAll();
            vscode.window.showInformationMessage(`Removed '${removedEntry}' from Stanza ignore list.`);
        }),
    );

    // Register the warmUp command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.warmUp", async () => {
            await provider.warmUpWorkspace("manual");
            vscode.window.showInformationMessage("Stanza: Workspace badges warmed up!");
        }),
    );

    // Register the setExtensionLimit command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.setExtensionLimit", async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== "file") {
                return;
            }

            const fileExtension = getPathExtension(uri.fsPath).toLowerCase();
            if (!fileExtension) {
                vscode.window.showErrorMessage("Could not determine file extension.");
                return;
            }

            const config = vscode.workspace.getConfiguration("lineCounter");
            const extensionLimits: unknown = config.get("extensionLimits", {});
            const excludeExtensions: string[] = config.get("excludeExtensions", []);

            // Check if this extension is currently excluded
            const isExcluded = excludeExtensions.some((ext) => ext.toLowerCase() === fileExtension);

            if (isExcluded) {
                const answer = await vscode.window.showInformationMessage(
                    `The extension '${fileExtension}' is currently in the ignore list. Do you want to remove it from the ignore list and set a line limit for it?`,
                    "Yes",
                    "No",
                );

                if (answer !== "Yes") {
                    return;
                }

                // Remove from exclude list
                const updatedExcludeExtensions = excludeExtensions.filter((ext) => ext.toLowerCase() !== fileExtension);
                await config.update("excludeExtensions", updatedExcludeExtensions, vscode.ConfigurationTarget.Global);
                await updateIgnoreMenuContexts();
            }

            // Get current limit if it exists
            const currentLimit = getExtensionLimit(extensionLimits, fileExtension, 0);
            const defaultValue = currentLimit > 0 ? currentLimit.toString() : "";

            // Ask for new limit
            const newLimitStr = await vscode.window.showInputBox({
                prompt: `Set line limit for '${fileExtension}' files`,
                placeHolder: "Enter line limit (number)",
                value: defaultValue,
                validateInput: (value) => {
                    if (!value.trim()) {
                        return "Please enter a number or 0 to remove the limit.";
                    }
                    const num = Number(value.trim());
                    if (!Number.isInteger(num) || num < 0) {
                        return "Please enter a positive integer or 0 to remove the limit.";
                    }
                    return null;
                },
            });

            if (newLimitStr === undefined) {
                return; // User cancelled
            }

            const newLimit = Number(newLimitStr.trim());

            if (newLimit === 0) {
                // Remove the extension limit
                let updatedLimits: unknown;
                if (Array.isArray(extensionLimits)) {
                    updatedLimits = extensionLimits.filter(
                        (entry: unknown) =>
                            !(
                                isExtensionLimitEntry(entry) &&
                                entry.extension.toLowerCase() === fileExtension.toLowerCase()
                            ),
                    );
                } else if (extensionLimits && typeof extensionLimits === "object") {
                    updatedLimits = { ...(extensionLimits as Record<string, unknown>) };
                    // Remove case-insensitively
                    for (const ext of Object.keys(updatedLimits as Record<string, unknown>)) {
                        if (ext.toLowerCase() === fileExtension.toLowerCase()) {
                            delete (updatedLimits as Record<string, unknown>)[ext];
                        }
                    }
                } else {
                    updatedLimits = {};
                }
                await config.update("extensionLimits", updatedLimits, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Removed line limit for '${fileExtension}' files.`);
            } else {
                // Set the extension limit
                let updatedLimits: ExtensionLimitEntry[] | Record<string, unknown>;
                if (Array.isArray(extensionLimits)) {
                    const normalizedLimits = extensionLimits.filter(isExtensionLimitEntry);
                    const index = normalizedLimits.findIndex(
                        (entry) => entry.extension.toLowerCase() === fileExtension.toLowerCase(),
                    );
                    updatedLimits = [...normalizedLimits];
                    if (index !== -1) {
                        updatedLimits[index] = { ...updatedLimits[index], limit: newLimit };
                    } else {
                        updatedLimits.push({ extension: fileExtension, limit: newLimit });
                    }
                } else if (extensionLimits && typeof extensionLimits === "object") {
                    updatedLimits = { ...(extensionLimits as Record<string, unknown>) };
                    // Find existing key case-insensitively or use fileExtension
                    let targetKey = fileExtension;
                    for (const ext of Object.keys(updatedLimits as Record<string, unknown>)) {
                        if (ext.toLowerCase() === fileExtension.toLowerCase()) {
                            targetKey = ext;
                            break;
                        }
                    }
                    (updatedLimits as Record<string, unknown>)[targetKey] = newLimit;
                } else {
                    updatedLimits = { [fileExtension]: newLimit };
                }
                await config.update("extensionLimits", updatedLimits, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Set line limit for '${fileExtension}' files to ${newLimit}.`);
            }

            // Refresh decorations to apply the new limit
            provider.refreshAll();
        }),
    );

    // Register the generateReport command
    context.subscriptions.push(
        vscode.commands.registerCommand("lineCounter.generateReport", () => {
            void generateReport();
        }),
    );
}
