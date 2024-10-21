import { openDb } from "./db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import Queue, { type QueuedSong } from "./queue";
import QueueCommand from "./commands/queue";
import { ActionRowBuilder, ButtonBuilder, ButtonComponent, ButtonInteraction, ButtonStyle, Client, ComponentType, EmbedBuilder, Events, REST, Routes, TextChannel } from "discord.js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { Command } from "./commands/base";
import { loadConfig } from "./config";
import ListCommand from "./commands/list";

GlobalFonts.registerFromPath('./fonts/NotoSansJP-VariableFont_wght.ttf', 'Noto Sans JP');
const config = await loadConfig();
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
    ctx.font = 'bold 40px "Noto Sans JP"';
    ctx.fillText(current.title, 100, 800, 1920 - 200);

    // username under title
    try {
        let guild = client.guilds.cache.get(config.guildId);
        if (!guild) {
            guild = await client.guilds.fetch(config.guildId);
        }
        const member = await guild.members.fetch(current.userId);
        const username = member.displayName;
        ctx.font = '32px "Noto Sans JP"';
        ctx.fillText(username, 100, 850, 1920 - 200);
    } catch (e) {
        console.error('Failed to fetch username:', e);
    }

    // next up to right
    ctx.font = 'bold 32px "Noto Sans JP"';
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
    
        
    const data = await canvas.encode('jpeg');
    await Bun.write(path, data.buffer);
}

async function tryPlayNext(poll=1000) {
    const dequeued = await queue.transaction(tx => ({
        current: tx.dequeue(),
        next: tx.findQueued(10),
    }));
    
    if (dequeued.current) {
        await writePreviewImage(dequeued.current, dequeued.next, 'preview.jpg');

        const socket = process.platform === 'win32' ? '\\\\.\\pipe\\mpv-socket' : '/tmp/mpv-socket';
        const proc = Bun.spawn([
            config.mpvPath,
            '--pause',
            '--fs',
            '--input-ipc-server=' + socket,
            'preview.jpg',
            dequeued.current.url,
        ]);

        const channel =  client.channels.cache.get(config.channelId) as TextChannel;
        if (!channel) {
            throw new Error('Channel not found');
        }

        const embed = new EmbedBuilder()
            .setTitle(dequeued.current.title)
            .setDescription('Playback will begin when either you or an admin press the play button below, or the playback timeout is reached.')
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

        try {
            console.log('Waiting for play button');
            const interaction = await msg.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: (i) => i.customId === 'play' && (
                    i.user.id === dequeued.current!.userId ||
                    config.adminUsers.includes(i.user.id) ||
                    i.member!.roles.cache.some(role => config.adminRoles.includes(role.id))
                ),
                time: config.playbackTimeout * 1000,
            });
            console.log('Play button pressed');
            await interaction.update({
                components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents([
                        new ButtonBuilder()
                            .setCustomId('play')
                            .setLabel('Playback started')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                    ]),
                ]
            });
        } catch (e) {
            console.error('Play button timed out');
        } finally {
            const sock = Bun.file(socket);
            const writer = sock.writer();
            writer.write('cycle pause\n');
            writer.end();
            await proc.exited;
        }
    }
    setTimeout(tryPlayNext, poll);
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

    tryPlayNext();
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
