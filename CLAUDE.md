# CLAUDE.md

Project-specific instructions for Claude Code sessions.

## Windows Bash Command Issues

On this Windows environment, certain commands (npm, pnpm, az, docker compose) return empty output when run through Git Bash or PowerShell in non-interactive mode. This is because these tools are `.cmd` wrapper scripts that don't execute properly in those shells.

### Solution

Use the executable directly with `.exe` suffix for commands that have issues:

```bash
# Instead of:
docker ps
docker compose build

# Use:
docker.exe ps
docker.exe build

# For npm/pnpm, you may need:
npm.cmd install
pnpm.cmd install
```

Alternatively, wrap commands in `cmd /c` if the `.exe` approach doesn't work:

```bash
cmd /c "docker ps"
```

## Docker

This project uses a multi-stage Dockerfile that builds the React app and serves it via nginx. Files are copied during build, not mounted as volumes.

To update the container with code changes:
1. Rebuild the image: `docker.exe build --no-cache -t airspace-visualizer .`
2. Restart the container: `docker.exe stop airspace && docker.exe rm airspace && docker.exe run -d --name airspace -p 8080:80 airspace-visualizer`

There is no docker-compose.yml file - the container is run directly with `docker run`.
