
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { QueuedSong } from "./queue";
import type { Client } from "discord.js";
import type { AppConfig } from "./config";

GlobalFonts.registerFromPath('./fonts/NotoSansJP-VariableFont_wght.ttf', 'Noto Sans JP');
GlobalFonts.registerFromPath('./fonts/NotoColorEmoji-Regular.ttf', 'Noto Color Emoji');

export async function writePreviewImage(
    current: QueuedSong,
    next: QueuedSong[],
    client: Client,
    config: AppConfig,
    path: string,
): Promise<void> {
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');

    // background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1920, 1080);

    const currentImage = await loadImage(current.thumbnail);
    ctx.drawImage(currentImage, 100, 100, 1024, 576);

    // title under image
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 40px "Noto Sans JP", "Noto Color Emoji"';
    ctx.fillText(current.title, 100, 800, 1920 - 200);

    // username under title
    try {
        let guild = client.guilds.cache.get(config.guildId);
        if (!guild) {
            guild = await client.guilds.fetch(config.guildId);
        }
        const member = await guild.members.fetch(current.userId);
        const username = member.displayName;
        ctx.font = '32px "Noto Sans JP", "Noto Color Emoji"';
        ctx.fillText(username, 100, 850, 1920 - 200);
    } catch (e) {
        console.error('Failed to fetch username:', e);
    }

    ctx.font = '24px "Noto Sans JP", "Noto Color Emoji"';
    ctx.fillText(
        `Playback will begin in ${config.playbackTimeout} seconds. ` +
        'Press the play button on your Discord client to start playback immediately.'
    , 100, 950, 1920 - 200);


    if (next.length > 0) {
        ctx.font = 'bold 32px "Noto Sans JP", "Noto Color Emoji"';
        ctx.fillText('Next up:', 1200, 100);
        const ellipsis = '…';
        for (let i = 0; i < next.length; i++) {
            const song = next[i];
            const text = `${i + 1}. ${song.title}`;
            const width = ctx.measureText(text).width;
            if (width > 600) {
                let newText = text;
                while (ctx.measureText(newText + ellipsis).width > 600) {
                    newText = newText.slice(0, -1);
                }
                ctx.fillText(newText + ellipsis, 1200, 200 + i * 50);
            } else {
                ctx.fillText(text, 1200, 200 + i * 50);
            }
        }
    } else {
        ctx.font = 'bold 32px "Noto Sans JP", "Noto Color Emoji"';
        ctx.fillText('Use /enqueue to add more songs to the queue.', 1200, 200);
        ctx.fillText('The queue is currently empty.', 1200, 250);
    }
        
    const data = await canvas.encode('jpeg');
    await Bun.write(path, data.buffer);
}

export async function writeLoadingImage(current: QueuedSong, path: string): Promise<void> {
    const canvas = createCanvas(1920, 1080);
    const ctx = canvas.getContext('2d');

    const currentImage = await loadImage(current.thumbnail);
    ctx.drawImage(currentImage, 0, 0, 1920, 1080);

    ctx.font = 'bold 40px "Noto Sans JP", "Noto Color Emoji"';

    const possibleEmojis = ['🤖', '🫠', '🎶', '🎵', '🔃'];
    const possibleMessages = [
        '動画を読み込み中',
        'Loading...',
    ];

    const randomEmoji = possibleEmojis[Math.floor(Math.random() * possibleEmojis.length)];
    const randomMessage = possibleMessages[Math.floor(Math.random() * possibleMessages.length)];
    const text = `${randomEmoji} ${randomMessage} ${randomEmoji}`;
    const textWidth = ctx.measureText(text).width;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(100, 800, textWidth + 70, 90, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 135, 860);

    const data = await canvas.encode('jpeg');
    await Bun.write(path, data.buffer);
}
