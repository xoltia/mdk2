import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";
import { getVideoInfo, type YtDlpOptions } from '../yt-dlp';
import type { NewSong } from '../queue';

type SwapCommandConfig = {
    adminRoles: string[];
    adminUsers: string[];
    allowSelfSwap: boolean;
    ytDlpOptions: YtDlpOptions;
};

export default class SwapCommand implements Command {
    constructor(
        private queue: Queue,
        private config: SwapCommandConfig,
    ) {}

    data = new SlashCommandBuilder()
        .setName('swap')
        .setDescription('Change the song at a specific position in the queue')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('The ID of the song to swap')
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the new song')
                .setRequired(true)
        );
        

    async execute(interaction: CommandInteraction) {
        let roles = interaction.member!.roles;
        if (!Array.isArray(roles)) {
            roles = roles.cache.keys().toArray();
        }
        const isAdminUser = this.config.adminUsers.includes(interaction.user.id);
        const isAdminRole = roles.some(role => this.config.adminRoles.includes(role));
        const isAdmin = isAdminUser || isAdminRole;
        if (!isAdmin && !this.config.allowSelfSwap) {
            await interaction.reply('You do not have permission to swap songs.');
            return;
        }

        await interaction.deferReply();

        const id = interaction.options.get('id')!.value as number;
        const url = interaction.options.get('url')!.value as string;
        const songInfo = await getVideoInfo(url, this.config.ytDlpOptions);
        const song: NewSong = {
            title: songInfo.title,
            url: songInfo.url,
            duration: songInfo.duration,
            thumbnail: songInfo.thumbnail,
        };

        const error = this.queue.transaction(tx => {
            const queuedSong = tx.findById(id);
            if (!queuedSong)
                    return "No song found with the specified ID.";
            if (queuedSong.position < 0)
                    return "This song has already played.";
            if (!isAdmin && queuedSong.userId !== interaction.user.id)
                    return "You do not have permission to swap this song.";
            tx.swapSong(id, song);
        });

        await interaction.editReply(error ?? 'Song swapped.');
    }
}