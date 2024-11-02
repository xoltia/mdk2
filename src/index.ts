import { openDb } from "./db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import Queue, { type QueuedSong } from "./queue";
import QueueCommand from "./commands/queue";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Client,
    ComponentType,
    EmbedBuilder,
    Events,
    REST,
    Routes,
    TextChannel
} from "discord.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { Command } from "./commands/base";
import { loadConfig } from "./config";
import ListCommand from "./commands/list";
import { MPV } from "./mpv";
import MoveCommand from "./commands/move";
import SwapCommand from "./commands/swap";
import RemoveCommand from "./commands/remove";
import colors from "./colors";
import StatsCommand from "./commands/stats";
import { unlink } from "fs/promises";
import { join as joinPath, basename } from "path";
import { select, confirm } from "@inquirer/prompts";
import PurgeCommand from "./commands/purge";

GlobalFonts.registerFromPath('./fonts/NotoSansJP-VariableFont_wght.ttf', 'Noto Sans JP');
GlobalFonts.registerFromPath('./fonts/NotoColorEmoji-Regular.ttf', 'Noto Color Emoji');
const config = await loadConfig();

// If the database already exists, ask the user if they want to start a new queue
const dbFile = Bun.file(config.dbFile);
const backupPath = joinPath('backup', `${Date.now()}.sqlite3.bak`);
const backupGlob = new Bun.Glob('backup/*.sqlite3.bak');
const backupFiles = await Array.fromAsync(backupGlob.scan());
const hasBackups = backupFiles.length > 0;
const hasDb = await dbFile.exists();

if (hasDb || hasBackups) {
    const choices = [{ name: 'Start a new queue', value: 'newQueue' }];
    if (hasDb)
        choices.unshift({ name: 'Continue existing queue', value: 'continueQueue' });
    if (hasBackups)
        choices.push({ name: 'Restore from backup', value: 'restoreBackup' });

    const result = await select({
        message: 'What would you like to do?',
        choices,
    });

    if (result === 'newQueue') {
        const confirmed = await confirm({
            message: 'Make sure there are no other instances of the bot running. Are you sure you want to start a new queue?',
        });
        if (!confirmed)
            process.exit(0);
        await Bun.write(backupPath, dbFile);
        await unlink(config.dbFile);
    } else if (result === 'restoreBackup') {
        const backupChoices = backupFiles.map(backup => {
            const filename = basename(backup);
            const date = new Date(parseInt(filename.split('.')[0]));
            return {
                name: date.toLocaleString(),
                value: backup,
            };
        });
        const backupFile = await select({
            message: 'Select a backup to restore',
            choices: backupChoices,
        });
        const confirmed = await confirm({
            message: `This action will overwrite the current database. Do you want to continue?`,
        });
        if (!confirmed)
            process.exit(0);
        await Bun.write(dbFile, Bun.file(backupFile));
    }
}

const db = openDb(config.dbFile);
migrate(db, { migrationsFolder: "./drizzle" });

async function writePreviewImage(current: QueuedSong, next: QueuedSong[], path: string) {
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

async function writeLoadingImage(current: QueuedSong, path: string) {
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

async function loopTryPlayNext(mpv: MPV, poll=1000) {
    const dequeued = queue.transaction(tx => ({
        current: tx.dequeue(),
        next: tx.findQueued(10),
    }));
    
    if (!dequeued.current) {
        setTimeout(loopTryPlayNext, poll, mpv, poll);
        return;
    }

    console.log(`Playing ${dequeued.current.title}`);

    await writePreviewImage(dequeued.current, dequeued.next, './temp/preview.jpg');
    await writeLoadingImage(dequeued.current, './temp/loading.jpg');

    await mpv.load('./temp/preview.jpg');
    await mpv.fullscreen();
    await mpv.pause();
    await mpv.load('./temp/loading.jpg', 'append');
    await mpv.load(dequeued.current.url, 'append');

    const channel = client.channels.cache.get(config.channelId) as TextChannel | undefined;
    if (!channel) {
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

    setTimeout(loopTryPlayNext, poll, mpv, poll);
}

const queue = new Queue(db);
const commands: Command[] = [
    new QueueCommand(queue, {
        userLimit: config.userLimit,
        rolesExempt: config.adminRoles,
        usersExempt: config.adminUsers,
        ytDlpOptions: { ytDlpPath: config.ytDlpPath },
    }),
    new ListCommand(queue),
    new MoveCommand(queue, config.adminUsers, config.adminRoles),
    new SwapCommand(queue, {
        adminRoles: config.adminRoles,
        adminUsers: config.adminUsers,
        allowSelfSwap: config.allowSelfSwap,
        ytDlpOptions: { ytDlpPath: config.ytDlpPath },
    }),
    new RemoveCommand(queue, config.adminUsers, config.adminRoles),
    new StatsCommand(queue),
    new PurgeCommand(queue, config.adminUsers, config.adminRoles),
];

const client = new Client({ intents: ['Guilds', 'GuildMembers'] });
const token = config.discordToken;
if (!token)
    throw new Error('Missing DISCORD_TOKEN env var');

client.once(Events.ClientReady, async () => {
    console.log('Ready!');
    const rest = new REST({ version: '9' }).setToken(token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(client.user!.id, config.guildId),
            { body: commands.map(command => command.data.toJSON()) },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    
    const mpv = new MPV(config.mpvPath, config.screenNumber);
    await mpv.start();
    console.log('MPV started, do not close the MPV window!');
    console.log('To stop the bot, close this terminal window.');
    loopTryPlayNext(mpv);

    mpv.on('exit', () => {
        console.error('MPV process exited');
        process.exit(1);
    });
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const command = commands.find(c => c.data.name === interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
    }
});

client.login(token);
