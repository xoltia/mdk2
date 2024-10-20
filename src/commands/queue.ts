import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";
import { getVideoInfo, type YtDlpOptions } from '../yt-dlp';
import type { NewSong } from '../queue';

type QueueCommandConfig = {
    userLimit: number;
    rolesExempt: string[];
    usersExempt: string[];
    ytDlpOptions: YtDlpOptions;
};

class UserLimitError extends Error {
    constructor(limit: number) {
        super(`You can only have ${limit} ${limit === 1 ? 'song' : 'songs'} in the queue.`);
    }
}

export default class QueueCommand implements Command {
    constructor(
        private queue: Queue,
        private config: QueueCommandConfig,
    ) {}

    data = new SlashCommandBuilder()
        .setName('enqueue')
        .setDescription('Add a song to the queue')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the song to add')
                .setRequired(true)
        );
        

    async execute(interaction: CommandInteraction) {
        await interaction.deferReply();

        const url = interaction.options.get('url')!.value as string;
        const songInfo = await getVideoInfo(url, this.config.ytDlpOptions);
        const song: NewSong = {
            title: songInfo.title,
            url: songInfo.url,
            duration: songInfo.duration,
            thumbnail: songInfo.thumbnail,
            userId: interaction.user.id,
        };

        let roles = interaction.member!.roles;
        if (!Array.isArray(roles)) {
            roles = roles.cache.keys().toArray();
        }

        try {
            const queued = await this.queue.transaction(tx => {
                const isExemptUser = this.config.usersExempt.includes(interaction.user.id);
                const isExemptRole = roles.some(role => this.config.rolesExempt.includes(role));
                const isExempt = isExemptUser || isExemptRole;
                if (!isExempt) {
                    const userCount = tx.countQueuedByUserId(interaction.user.id);
                    if (userCount >= this.config.userLimit)
                        throw new UserLimitError(this.config.userLimit);
                }
                return tx.enqueue(song)
            });

            await interaction.editReply(`Your song **${queued.title}** is number **${queued.position + 1}** in the queue.`);
        } catch (error) {
            if (error instanceof UserLimitError)
                await interaction.editReply(error.message);
            else
                throw error;
        }
    }
}