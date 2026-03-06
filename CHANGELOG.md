# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.3] - 2026-03-06

### Modified
- **fix**: Remove bold unicode characters from line count badges.

## [0.6.2] - 2026-03-06

### Modified
- **chore: Readme**: Bump version to 0.6.2 folowing deploy error.

## [0.6.1] - 2026-03-06

### Modified
- **chore: Readme**: Updated README.md with screenshots.

## [0.6.0] - 2026-03-06

### Added
- **Feature: Folder warning tags**: Folders now display a warning badge (⚠) if they contain files exceeding the line limit.
- **Performance: Workspace Warmup**: A new opt-in feature (`lineCounter.enableWorkspaceWarmUp`) to scan the workspace at startup. This ensures folder badges are visible immediately without needing to open the folders in the Explorer.
- **Performance: Streaming line counts**: Optimization using Node streams to count lines in large files without loading the entire content into memory, significantly reducing memory footprint.
- **Performance: Intelligent caching**: Improved caching mechanism with automatic invalidation on file changes to avoid redundant calculations.
- **Configuration**: `lineCounter.showFolderBadges` to toggle folder warnings.
- **Configuration**: Reorganized settings for better clarity and updated descriptions explaining dependencies between folder badges and workspace warmup.
- **Code Quality**: Introduced `ESLint v10` and `typescript-eslint` for improved code maintenance and catch potential issues early.

## [0.5.0] - 2026-03-05

### Added
- Feature: Add file/folder to ignore list from Explorer context menu.
- Better wording for ignore options in settings.

## [0.4.0] - 2026-03-04

### Added
- Option to use emojis instead of line count badges (😎, 😬, 😡).

## [0.3.1] - 2026-03-04

### Added
- Meaningful unit tests for core logic using Vitest.

## [0.3.0] - 2026-03-04

### Added
- Maximum file size exclusion (default 10MB) to prevent performance issues.

## [0.2.2] - 2026-03-04

### Added
- Ignore folders option with `node_modules`, `.git`, `vendor`, etc., ignored by default.

## [0.2.1] - 2026-03-04

### Fixed
- README badge issues and VSIX installation documentation.

## [0.2.0] - 2026-03-04

### Added
- Customizable threshold alert colors.
- Unicode bold formatting for line count badges.

## [0.1.0] - 2026-03-04

### Added
- Initial release: basic line count badges in the Explorer panel.
