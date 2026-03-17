import * as vscode from "vscode";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
    let workspaceFolders: vscode.WorkspaceFolder[] | undefined = [
        { uri: { fsPath: "/workspace", scheme: "file" } } as vscode.WorkspaceFolder,
    ];
    const showErrorMessage = vi.fn();
    const showTextDocument = vi.fn();
    const openTextDocument = vi.fn(() => ({}));
    const findFiles = vi.fn(async (): Promise<vscode.Uri[]> => []);
    const withProgress = vi.fn(async (options: unknown, task: (progress: unknown, token: unknown) => Promise<void>) => {
        return await task({ isCancellationRequested: false }, { isCancellationRequested: false });
    });
    const stat = vi.fn(
        async (_uri: vscode.Uri): Promise<vscode.FileStat> => ({ size: 100, type: 1, ctime: 0, mtime: 0 }),
    );
    const readFile = vi.fn(async (): Promise<Uint8Array> => new Uint8Array([]));
    const writeFile = vi.fn(async (_uri: unknown, _content: Uint8Array): Promise<void> => {});
    const asRelativePath = vi.fn((uri: vscode.Uri) => uri.fsPath.replace("/workspace/", ""));

    let config: Record<string, unknown> = {
        limit: 300,
        maxFileSizeMB: 10,
        excludeExtensions: [],
        excludeFolders: ["node_modules"],
        extensionLimits: {},
    };

    return {
        get workspaceFolders() {
            return workspaceFolders;
        },
        set workspaceFolders(val) {
            workspaceFolders = val;
        },
        showErrorMessage,
        showTextDocument,
        openTextDocument,
        findFiles,
        withProgress,
        stat,
        readFile,
        writeFile,
        asRelativePath,
        getConfiguration: vi.fn(() => ({
            get: (key: string, fallback: unknown) => (config[key] !== undefined ? config[key] : fallback),
        })),
        setConfig(newConfig: Record<string, unknown>) {
            config = { ...config, ...newConfig };
        },
        reset() {
            workspaceFolders = [
                {
                    uri: {
                        fsPath: "/workspace",
                        scheme: "file",
                        joinPath: vi.fn((base, ...paths) => ({ fsPath: base.fsPath + "/" + paths.join("/") })),
                    },
                },
            ] as unknown as vscode.WorkspaceFolder[];
            showErrorMessage.mockReset();
            showTextDocument.mockReset();
            openTextDocument.mockReset();
            findFiles.mockReset();
            withProgress.mockClear();
            stat.mockClear();
            readFile.mockClear();
            writeFile.mockClear();
            asRelativePath.mockClear();
            config = {
                limit: 300,
                maxFileSizeMB: 10,
                excludeExtensions: [],
                excludeFolders: ["node_modules"],
                extensionLimits: {},
            };
        },
    };
});

vi.mock("vscode", () => {
    return {
        Uri: {
            joinPath: vi.fn((base, ...paths) => ({ fsPath: base.fsPath + "/" + paths.join("/") })),
            file: vi.fn((path) => ({ fsPath: path, scheme: "file" })),
        },
        ProgressLocation: {
            Notification: 15,
        },
        window: {
            showErrorMessage: mockState.showErrorMessage,
            withProgress: mockState.withProgress,
            showTextDocument: mockState.showTextDocument,
        },
        workspace: {
            get workspaceFolders() {
                return mockState.workspaceFolders;
            },
            getConfiguration: mockState.getConfiguration,
            findFiles: mockState.findFiles,
            asRelativePath: mockState.asRelativePath,
            openTextDocument: mockState.openTextDocument,
            fs: {
                stat: mockState.stat,
                readFile: mockState.readFile,
                writeFile: mockState.writeFile,
            },
        },
    };
});

vi.mock("./utils", () => {
    return {
        countLines: vi.fn(() => 10),
        countLinesStream: vi.fn(async () => 500),
        shouldExcludePath: vi.fn(() => false),
        isTooLarge: vi.fn(() => false),
        getPathExtension: vi.fn((path) => {
            const parts = path.split(".");
            return parts.length > 1 ? "." + parts.pop() : "";
        }),
        getExtensionLimit: vi.fn((limits, ext, globalLimit) => globalLimit),
    };
});

import { generateReport } from "./reportGenerator";
import * as utils from "./utils";

describe("generateReport", () => {
    beforeEach(() => {
        mockState.reset();
        vi.clearAllMocks();
    });

    it("shows error if no workspace folders", async () => {
        mockState.workspaceFolders = undefined;
        await generateReport();
        expect(mockState.showErrorMessage).toHaveBeenCalledWith("No workspace folder is open to generate a report.");
        expect(mockState.withProgress).not.toHaveBeenCalled();
    });

    it("generates an empty report if no files found", async () => {
        mockState.findFiles.mockResolvedValueOnce([]);
        await generateReport();
        expect(mockState.writeFile).toHaveBeenCalled();
        const call = vi.mocked(mockState.writeFile).mock.calls[0];
        const content = new TextDecoder("utf-8").decode(call[1] as Uint8Array);
        expect(content).toContain("✅ OK Files**: 0");
        expect(content).toContain("⚠️ Almost KO Files**: 0");
        expect(content).toContain("❌ KO Files**: 0");
    });

    it("processes files and categorizes them correctly", async () => {
        const mockUris = [
            { fsPath: "/workspace/ok.ts", scheme: "file" },
            { fsPath: "/workspace/almost.ts", scheme: "file" },
            { fsPath: "/workspace/ko.ts", scheme: "file" },
        ];
        mockState.findFiles.mockResolvedValueOnce(mockUris as unknown as vscode.Uri[]);

        // Mock countLinesStream for different lines
        vi.mocked(utils.countLinesStream).mockImplementation(async (fsPath: string) => {
            if (fsPath.includes("ok")) {
                return 100;
            }
            if (fsPath.includes("almost")) {
                return 290;
            }
            if (fsPath.includes("ko")) {
                return 350;
            }
            return 0;
        });

        await generateReport();

        expect(mockState.writeFile).toHaveBeenCalled();
        const content = new TextDecoder("utf-8").decode(vi.mocked(mockState.writeFile).mock.calls[0][1] as Uint8Array);

        expect(content).toContain("✅ OK Files**: 1");
        expect(content).toContain("⚠️ Almost KO Files**: 1");
        expect(content).toContain("❌ KO Files**: 1");
        expect(content).toContain("ko.ts` | **350** | 300 |");
        expect(content).toContain("almost.ts` | **290** | 300 |");
    });

    it("skips excluded files and too large files", async () => {
        const mockUris = [
            { fsPath: "/workspace/excluded.ts", scheme: "file" },
            { fsPath: "/workspace/toolarge.ts", scheme: "file" },
            { fsPath: "/workspace/ok.ts", scheme: "file" },
        ];
        mockState.findFiles.mockResolvedValueOnce(mockUris as unknown as vscode.Uri[]);

        vi.mocked(utils.shouldExcludePath).mockImplementation((fsPath: string) => fsPath.includes("excluded"));
        vi.mocked(utils.isTooLarge).mockImplementation((size: number) => size > 1000);
        mockState.stat.mockImplementation(async (uri: vscode.Uri): Promise<vscode.FileStat> => {
            if (uri.fsPath.includes("toolarge")) {
                return { size: 2000, type: 1, ctime: 0, mtime: 0 };
            }
            return { size: 100, type: 1, ctime: 0, mtime: 0 };
        });

        vi.mocked(utils.countLinesStream).mockResolvedValue(100);

        await generateReport();

        expect(mockState.writeFile).toHaveBeenCalled();
        const content = new TextDecoder("utf-8").decode(mockState.writeFile.mock.calls[0][1] as Uint8Array);

        expect(content).toContain("✅ OK Files**: 1");
        expect(content).not.toContain("excluded.ts");
        expect(content).not.toContain("toolarge.ts");
    });
});
