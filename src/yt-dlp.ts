import ytdl from "@distube/ytdl-core";

export type VideoInfo = {
    id: string;
    title: string;
    url: string;
    duration: number;
    thumbnail: string;
};

export type YtDlpOptions = {
    ytDlpPath: string;
    disableYtdlCore?: boolean;
};

function pickBestThumbnail(thumbnails: ytdl.thumbnail[]): ytdl.thumbnail | undefined {
    if (thumbnails.length === 0)
        return undefined;

    let bestRes = 0;
    let bestThumbnail = thumbnails[0];

    for (const thumbnail of thumbnails) {
        const res = thumbnail.width * thumbnail.height;
        if (res > bestRes) {
            bestRes = res;
            bestThumbnail = thumbnail;
        }
    }

    return bestThumbnail;
}

function checkForYouTubeId(url: string): string | null {
    const ytVideoLinkRegex = /(?:youtube\.com\/watch\?v=|youtube\.com\/live\/|youtu\.be\/)([a-zA-Z0-9_-]+)/;
    const match = url.match(ytVideoLinkRegex);
    return match ? match[1] : null;
}

export async function getVideoInfo(url: string, options: YtDlpOptions): Promise<VideoInfo> {
    const ytId = checkForYouTubeId(url);
    if (!options.disableYtdlCore && ytId) {
        try {
            const info = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${ytId}`);
            if (info.videoDetails.thumbnails.length === 0)
                throw new Error('No thumbnails found');
            return {
                id: info.videoDetails.videoId,
                title: info.videoDetails.title,
                url: info.videoDetails.video_url,
                duration: parseInt(info.videoDetails.lengthSeconds),
                thumbnail: pickBestThumbnail(info.videoDetails.thumbnails)!.url,
            };
        } catch (e) {
            console.error('Failed to get video info with ytdl-core:', e);
        }
    }

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