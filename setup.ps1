# This folder contains the setup script for making a portable
# installation of the program. Outputs to the dist folder.
# Before running this, make sure to build the program using
# `bun run generate` and then `bun run build`.

# Modify the config.json file in the dist folder to
# configure the program.

# Output folder variable
$OutputFolder = ".\dist"

# Make dir $OutputFolder\drizzle\meta
New-Item -ItemType Directory -Path "$OutputFolder\drizzle\meta"
# Copy .\drizzle\* to $OutputFolder\drizzle
Copy-Item -Path ".\drizzle\*" -Destination "$OutputFolder\drizzle" -Recurse

# Copy node_modules\@napi-rs\canvas-win32-x64-msvc\icudtl.dat to $OutputFolder\icudtl.dat
Copy-Item -Path ".\node_modules\@napi-rs\canvas-win32-x64-msvc\icudtl.dat" -Destination "$OutputFolder\icudtl.dat"

# Copy .\fonts\* to $OutputFolder\fonts
New-Item -ItemType Directory -Path "$OutputFolder\fonts"
Copy-Item -Path ".\fonts\*" -Destination "$OutputFolder\fonts" -Recurse

# Write "--ffmpeg-location ./ffmpeg/bin" to $OutputFolder\yt-dlp.conf
Set-Content -Path "$OutputFolder\yt-dlp.conf" -Value "--ffmpeg-location ./ffmpeg/bin"

# Write config.json
$config = @"
{
  "ytDlpPath": "./yt-dlp.exe",
  "mpvPath": "./mpv/mpv.exe"
}
"@

Set-Content -Path "$OutputFolder\config-portable.json" -Value $config

# Write RUN.bat
$run = @"
start /WAIT /B /d "%~dp0" mdk2.exe
pause
"@

Set-Content -Path "$OutputFolder\RUN.bat" -Value $run


# Download and extract https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile ".\ffmpeg-release-essentials.zip"
Expand-Archive -Path ".\ffmpeg-release-essentials.zip" -Destination "$OutputFolder\ffmpeg"
Remove-Item -Path ".\ffmpeg-release-essentials.zip"
# Move $OutputFolder\ffmpeg\ffmpeg-*-essentials_build\* to $OutputFolder\ffmpeg
Move-Item -Path "$OutputFolder\ffmpeg\ffmpeg-*-essentials_build\*" -Destination "$OutputFolder\ffmpeg" -Force
Remove-Item -Path "$OutputFolder\ffmpeg\ffmpeg-*-essentials_build" -Recurse

# Download and extract https://nightly.link/mpv-player/mpv/workflows/build/master/mpv-x86_64-windows-msvc.zip
Invoke-WebRequest -Uri "https://nightly.link/mpv-player/mpv/workflows/build/master/mpv-x86_64-windows-msvc.zip" -OutFile ".\mpv-x86_64-windows-msvc.zip"
Expand-Archive -Path ".\mpv-x86_64-windows-msvc.zip" -Destination "$OutputFolder\mpv"
Remove-Item -Path ".\mpv-x86_64-windows-msvc.zip"

# Download https://github.com/yt-dlp/yt-dlp/releases/download/2024.10.07/yt-dlp.exe 
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/download/2024.10.07/yt-dlp.exe" -OutFile "$OutputFolder\yt-dlp.exe"

# Download https://www.sqlite.org/2024/sqlite-tools-win-x64-3460100.zip and extract to $OutputFolder\sqlite
Invoke-WebRequest -Uri "https://www.sqlite.org/2024/sqlite-tools-win-x64-3460100.zip" -OutFile ".\sqlite-tools-win-x64-3460100.zip"
Expand-Archive -Path ".\sqlite-tools-win-x64-3460100.zip" -Destination "$OutputFolder\sqlite"
Remove-Item -Path ".\sqlite-tools-win-x64-3460100.zip"

# Write script for exporting the database to csv
$export = @"
.\sqlite\sqlite3.exe -header -csv .\queue.sqlite "SELECT * FROM queue INNER JOIN songs ON queue.songUrl = songs.url ORDER BY queue.position;" > .\queue.csv
"@

Set-Content -Path "$OutputFolder\EXPORT.bat" -Value $export

# Write readme
$readme = @"
Before running the program, make sure to configure the program by editing the config.json file.
You will need to set the `discordToken` and `guildId` fields for the bot to work, if they aren't already set.
Do not edit the path variables unless you wish to not use the bundled binaries.

To run the program, double click on the RUN.bat file.
If you want to export the queue at any time, double click on the EXPORT.bat file.
"@

Set-Content -Path "$OutputFolder\README.txt" -Value $readme

# Copy DIST_README.txt to $OutputFolder\README.txt
Copy-Item -Path ".\DIST_README.txt" -Destination "$OutputFolder\DIST_README.txt"
