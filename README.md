# StanzaLineCounter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

VS Code / Cursor extension that displays the line count of each file directly in the Explorer panel.

![StanzaLineCounter screenshot](images/screenshot.png)

## Features

- **Line count badges** — Each file shows a compact line count badge next to its name.
- **Threshold alert** — Files exceeding the configured limit are highlighted with a nice blue color.
- **Excluded extensions** — Skip files with specific extensions (logs, minified files, maps, images, fonts, archives, media files by default).
- **Live refresh** — Badges update automatically on file save, creation, deletion, and configuration changes.

## Badge format

| Lines       | Badge | Example        |
|-------------|-------|----------------|
| 0–99        | As-is | `42`           |
| 100–999     | `Xc`  | `3c` (≈ 300)   |
| 1,000–9,999 | `Xk`  | `1k`           |
| 10,000+     | `∞`   | `∞`            |

The exact line count is always shown in the tooltip on hover.

## Requirements

- [VS Code](https://code.visualstudio.com/) 
- [Cursor](https://cursor.sh/)
- [Antigravity](https://antigravity.google/) Not tested but it should work on all VS Code based IDEs

## Installation

1. Open VS Code or Cursor.
2. Go to **Extensions** (Ctrl+Shift+X / Cmd+Shift+X).
3. Search for **StanzaLineCounter**.
4. Click **Install**.

### Manual installation

1. Download the latest release or clone this repository.
2. Copy the folder to `~/.vscode/extensions/` (or your Cursor extensions directory).
3. Restart the editor.

## Configuration

| Setting                          | Type     | Default                       | Description                                                                 |
|----------------------------------|----------|-------------------------------|-----------------------------------------------------------------------------|
| `lineCounter.limit`              | number   | `300`                         | Line threshold — files above this show a warning badge.                     |
| `lineCounter.excludeExtensions`  | string[] | `[".log", ".min.js", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".pdf", ".zip", ".gz", ".tar", ".mp3", ".mp4", ".bin"]` | File extensions to exclude from counting. |

## Development

```bash
# Clone the repository
git clone https://github.com/<your-username>/StanzaLineCounter.git
cd StanzaLineCounter

# Install dependencies
npm install

# Compile
npm run compile   # or npm run watch for watch mode
```

Press **F5** in VS Code / Cursor to launch the Extension Development Host and test the extension.

## License

MIT © [mpicard](https://github.com/mpicard)
