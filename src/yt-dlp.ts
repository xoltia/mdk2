type VideoInfo = {
    id: string;
    title: string;
    url: string;
    duration: number;
    thumbnail: string;
};

export type YtDlpOptions = {
    ytDlpPath: string;
};

export async function getVideoInfo(url: string, options: YtDlpOptions): Promise<VideoInfo> {
    const proc = Bun.spawn([
        options.ytDlpPath,
        '--print-json',
        '--no-playlist',
        '--skip-download',        
        url,
    ]);

    const info = await new Response(proc.stdout).json();
    const expectedTypes: Record<string, string> = {
        id: 'string',
        title: 'string',
        webpage_url: 'string',
        duration: 'number',
        thumbnail: 'string',
    };

    for (const key in expectedTypes) {
        if (typeof info[key] !== expectedTypes[key])
            throw new Error(`Unexpected type for ${key}: ${typeof info[key]}`);
    }

    return {
        id: info.id,
        title: info.title,
        url: info.webpage_url,
        duration: info.duration,
        thumbnail: info.thumbnail,
    };
}

// export async function downloadVideo(url: string, path: string): Promise<void> {
//     const proc = Bun.spawn([
//         ytdlpPath,
//         '-o',
//         path,
//         url,
//     ]);

//     const exitCode = await proc.exited;
//     if (exitCode !== 0)
//         throw new Error(`Failed to download video: ${exitCode}`);
// }