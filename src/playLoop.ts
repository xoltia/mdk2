import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    ComponentType,
    EmbedBuilder,
    type Client,
} from "discord.js";
import { writeLoadingImage, writePreviewImage } from "./drawImages";
import type { MPV } from "./mpv";
import type Queue from "./queue";
import type { AppConfig } from "./config";
import colors from "./colors";
import type { QueuedSong } from "./queue";

export function loopTryPlayNext(
    mpv: MPV,
    queue: Queue,
    client: Client,
    config: AppConfig,
    loop: number = 1000,
): void {
    playNext(mpv, queue, client, config)
        .then(() => Bun.sleep(loop))
        .then(() => loopTryPlayNext(mpv, queue, client, config, loop));
}

async function playNext(
    mpv: MPV,
    queue: Queue,
    client: Client,
    config: AppConfig,
): Promise<QueuedSong | null> {
    const dequeued = queue.transaction(tx => ({
        current: tx.dequeue(),
        next: tx.findQueued(10),
    }));
    
    if (!dequeued.current) {
        return null;
    }

    console.log(`Playing ${dequeued.current.title}`);

    await writePreviewImage(
        dequeued.current,
        dequeued.next,
        client,
        config,
        './temp/preview.jpg',
    );
    await writeLoadingImage(dequeued.current, './temp/loading.jpg');

    await mpv.load('./temp/preview.jpg');
    await mpv.fullscreen();
    await mpv.pause();
    await mpv.load('./temp/loading.jpg', 'append');
    await mpv.load(dequeued.current.url, 'append');

    const channel = client.channels.cache.get(config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error('Channel not found');
    }

    const embed = new EmbedBuilder()
        .setTitle(
            dequeued.current.title.length > 256 ?
            dequeued.current.title.slice(0, 253) + '...' :
            dequeued.current.title
        )
        .setDescription(
            'Playback will begin when either you or an admin press the play button below, or the playback timeout is reached.'
        )
        .setColor(colors.secondary)
        .toJSON();

    const msg = await channel.send({
        content: `<@${dequeued.current.userId}>`,
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder()
                .setCustomId('play')
                .setLabel('Play')
                .setStyle(ButtonStyle.Primary),
        ])],
    });

    // Change font size for the OSD message
    const previousFontSize = await mpv.getProperty('osd-font-size');
    await mpv.setProperty('osd-font-size', 24);

    const now = new Date();
    const countdownInterval = setInterval(() => {
        const elapsed = (new Date().getTime() - now.getTime()) / 1000;
        const remaining = config.playbackTimeout - elapsed;
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            return;
        }
        mpv.osdMessage(`Starting in ${Math.round(remaining)} seconds`);
    }, 250);
    
    const interactionPromise = msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.customId === 'play' && (
            i.user.id === dequeued.current!.userId ||
            config.adminUsers.includes(i.user.id) ||
            i.member!.roles.cache.some(role => config.adminRoles.includes(role.id))
        ),
        time: config.playbackTimeout * 1000,
    });

    const playPromise = new Promise<ButtonInteraction | null>(resolve => {
        // Check if someone pressed the play button
        const interval = setInterval(async () => {
            if (!(await mpv.getProperty('pause'))) {
                clearInterval(interval);
                resolve(null);
            }
        }, 200);

        interactionPromise.then((i) => {
            // Someone pressed the play button
            clearInterval(interval);
            resolve(i);
        }).catch(() => {
            // Timeout reached
            clearInterval(interval);
            resolve(null);
        });
    });

    const interaction = await playPromise;
    clearInterval(countdownInterval);
    // Reset font size
    await mpv.setProperty('osd-font-size', previousFontSize);
    queue.setStartedAt(dequeued.current.id);

    const newComponents = [
        new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder()
                .setCustomId('play')
                .setLabel('Playback started')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
        ]),
    ];

    if (interaction) {
        await interaction.update({ components: newComponents });
    } else {
        await msg.edit({ components: newComponents });
    }

    await mpv.play();
    
    while (true) {
        if (await mpv.getProperty('idle-active'))
            break;
        await Bun.sleep(200);
    }

    return dequeued.current;
}