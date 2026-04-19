# CLAUDE.md

Project-specific instructions for Claude Code sessions.

## Windows Bash Command Issues

On this Windows environment, certain commands (npm, pnpm, az) return empty output when run through Git Bash or PowerShell in non-interactive mode. This is because these tools are `.cmd` wrapper scripts that don't execute properly in those shells.

### Solution

Use `.cmd` or `.exe` suffix, or wrap in `cmd /c`:

```bash
npm.cmd install
pnpm.cmd install
cmd /c "az group list"
```

## Deployment

This site is hosted on GitHub Pages via [.github/workflows/deploy-github-pages.yml](.github/workflows/deploy-github-pages.yml). Pushes to `main` trigger a build and deploy. The custom domain `airspace.llew.net` is configured via [public/CNAME](public/CNAME).

## Emergency Commands

### Fix Oversized Image Bug
When I say "fix image bug" or "fix session images", run this repair:

1. **Session selection** (first matching option):
   - Explicit path provided → use that file
   - Session ID provided → find matching .jsonl in ~/.claude/projects/*/
   - "list sessions" → show all sessions (ID, size, date, first prompt) and wait for selection
   - Custom directory provided → search there instead
   - Default → auto-detect by scanning recent .jsonl files for lines >5,242,880 bytes

2. Backup: copy to `.backup` extension

3. Identify oversized image lines (>5,242,880 bytes per line) using:
   - `grep -n '"type":"image"' <file>` for line numbers
   - Check line sizes with `sed -n '<N>p' <file> | wc -c`

4. Replace oversized lines with: `{"type":"summary","summary":"[Image removed - exceeded 5MB limit]","uuid":"REMOVED-<line-number>"}`

5. Report: file path, images removed, size reduction

6. Provide resume instructions:
   - Terminal: `claude --resume <session-id>`
   - VSCode: Reload window, then use session picker

Be idempotent. Skip lines with "REMOVED-" in uuid. Report if no oversized images found.