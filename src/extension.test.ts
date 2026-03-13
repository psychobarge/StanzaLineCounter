import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
    const commandHandlers = new Map<string, (uri: { scheme: string; fsPath: string }) => Promise<void> | void>();
    let excludeExtensions: string[] = [];
    let excludeFolders: string[] = [];
    let workspaceRoot: string | undefined = "/workspace";

    const refreshAll = vi.fn();
    const showInformationMessage = vi.fn();
    const registerFileDecorationProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const update = vi.fn(async (key: string, value: unknown) => {
        if (key === "excludeExtensions") {
            excludeExtensions = value as string[];
        }
        if (key === "excludeFolders") {
            excludeFolders = value as string[];
        }
    });

    return {
        commandHandlers,
        refreshAll,
        showInformationMessage,
        registerFileDecorationProvider,
        update,
        executeCommand: vi.fn(async () => undefined),
        reset() {
            commandHandlers.clear();
            excludeExtensions = [];
            excludeFolders = [];
            workspaceRoot = "/workspace";
            refreshAll.mockReset();
            showInformationMessage.mockReset();
            registerFileDecorationProvider.mockClear();
            update.mockClear();
            this.executeCommand.mockReset();
        },
        setExcludeExtensions(next: string[]) {
            excludeExtensions = [...next];
        },
        setExcludeFolders(next: string[]) {
            excludeFolders = [...next];
        },
        setWorkspaceRoot(next: string | undefined) {
            workspaceRoot = next;
        },
        getExcludeExtensions() {
            return [...excludeExtensions];
        },
        getExcludeFolders() {
            return [...excludeFolders];
        },
        getWorkspaceRoot() {
            return workspaceRoot;
        },
    };
});

vi.mock("./lineCountDecorationProvider", () => {
    class MockLineCountDecorationProvider {
        refreshAll = mockState.refreshAll;
        refreshUri = vi.fn();
        warmUpWorkspace = vi.fn(async () => undefined);
        dispose = vi.fn();
    }

    return { LineCountDecorationProvider: MockLineCountDecorationProvider };
});

vi.mock("vscode", () => {
    return {
        ConfigurationTarget: {
            Global: "Global",
        },
        commands: {
            registerCommand: vi.fn(
                (command: string, callback: (uri: { scheme: string; fsPath: string }) => Promise<void> | void) => {
                    mockState.commandHandlers.set(command, callback);
                    return { dispose: vi.fn() };
                },
            ),
            executeCommand: mockState.executeCommand,
        },
        window: {
            registerFileDecorationProvider: mockState.registerFileDecorationProvider,
            showInformationMessage: mockState.showInformationMessage,
        },
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: (key: string, fallback: unknown) => {
                    if (key === "excludeExtensions") {
                        return mockState.getExcludeExtensions();
                    }
                    if (key === "excludeFolders") {
                        return mockState.getExcludeFolders();
                    }
                    return fallback;
                },
                update: mockState.update,
            })),
            getWorkspaceFolder: vi.fn(() => {
                const root = mockState.getWorkspaceRoot();
                return root ? { uri: { fsPath: root } } : undefined;
            }),
            onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
            onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
            createFileSystemWatcher: vi.fn(() => ({
                onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
                onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
                onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
                dispose: vi.fn(),
            })),
            workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
        },
    };
});

import { activate } from "./extension";

describe("extension commands", () => {
    beforeEach(() => {
        mockState.reset();
        activate({ subscriptions: [] } as never);
    });

    it("removes an ignored extension case-insensitively", async () => {
        mockState.setExcludeExtensions([".TS", ".log"]);

        const command = mockState.commandHandlers.get("lineCounter.removeExtensionFromIgnoreList");
        expect(command).toBeDefined();

        await command?.({ scheme: "file", fsPath: "/workspace/src/file.ts" });

        expect(mockState.update).toHaveBeenCalledWith("excludeExtensions", [".log"], "Global");
        expect(mockState.refreshAll).toHaveBeenCalledOnce();
        expect(mockState.showInformationMessage).toHaveBeenCalledWith(
            "Removed '.ts' from Stanza extension ignore list.",
        );
    });

    it("does not update config if extension is not ignored", async () => {
        mockState.setExcludeExtensions([".log"]);

        const command = mockState.commandHandlers.get("lineCounter.removeExtensionFromIgnoreList");
        await command?.({ scheme: "file", fsPath: "/workspace/src/file.ts" });

        expect(mockState.update).not.toHaveBeenCalled();
        expect(mockState.refreshAll).not.toHaveBeenCalled();
        expect(mockState.showInformationMessage).toHaveBeenCalledWith("'.ts' is not in the extension ignore list.");
    });

    it("removes an ignored relative path with mixed separators and casing", async () => {
        mockState.setExcludeFolders(["Src\\Folder\\File.ts", "node_modules"]);
        mockState.setWorkspaceRoot("/workspace");

        const command = mockState.commandHandlers.get("lineCounter.removeFromIgnoreList");
        await command?.({ scheme: "file", fsPath: "/workspace/src/folder/file.ts" });

        expect(mockState.update).toHaveBeenCalledWith("excludeFolders", ["node_modules"], "Global");
        expect(mockState.refreshAll).toHaveBeenCalledOnce();
        expect(mockState.showInformationMessage).toHaveBeenCalledWith(
            "Removed 'Src\\Folder\\File.ts' from Stanza ignore list.",
        );
    });

    it("does not update config if file or folder is not ignored", async () => {
        mockState.setExcludeFolders(["node_modules"]);
        mockState.setWorkspaceRoot("/workspace");

        const command = mockState.commandHandlers.get("lineCounter.removeFromIgnoreList");
        await command?.({ scheme: "file", fsPath: "/workspace/src/file.ts" });

        expect(mockState.update).not.toHaveBeenCalled();
        expect(mockState.refreshAll).not.toHaveBeenCalled();
        expect(mockState.showInformationMessage).toHaveBeenCalledWith("'src/file.ts' is not in the ignore list.");
    });
});
