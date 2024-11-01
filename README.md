# mdk2

This is a Discord bot for hosting small in-person karaoke sessions.
Designed to be used in a single server, it allows users to queue up songs to sing
which will be played on the host's computer.

## Dependencies
### Building
- Bun
- Go 1.23

Run the following commands to build the project and
output to the `dist` directory.
```sh
bun install
bun run build
```

### Runtime
- mpv
- yt-dlp
- ffmpeg

## Portable Mode
Use the provided `setup.ps1` script to install the required runtime dependencies into the `dist` directory. This can
then be zipped up and distributed as a portable version of the bot.

### Using the Bot
See the README.txt in the `dist` directory for instructions on how to use the bot.

The following files are provided in the `dist` directory:
- `RUN.bat`: Run the bot
- `EXPORT.bat`: Output a CSV file of the current queue
- `CONFIGURE.exe`: Configure the bot
