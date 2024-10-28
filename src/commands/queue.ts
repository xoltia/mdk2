import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";
import { getVideoInfo, type YtDlpOptions } from '../yt-dlp';
import type { NewQueueSong } from '../queue';
import SlugGenerator from '../slugGenerator';
import colors from '../colors';

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
        private slugGenerator = new SlugGenerator(),
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
        const song: NewQueueSong = {
            title: songInfo.title,
            url: songInfo.url,
            duration: songInfo.duration,
            thumbnail: songInfo.thumbnail,
            userId: interaction.user.id,
            slug: '',
        };

        let roles = interaction.member!.roles;
        if (!Array.isArray(roles)) {
            roles = roles.cache.keys().toArray();
        }

        try {
            const queued = this.queue.transaction(tx => {
                const isExemptUser = this.config.usersExempt.includes(interaction.user.id);
                const isExemptRole = roles.some(role => this.config.rolesExempt.includes(role));
                const isExempt = isExemptUser || isExemptRole;
                if (!isExempt) {
                    const userCount = tx.countQueuedByUserId(interaction.user.id);
                    if (userCount >= this.config.userLimit)
                        throw new UserLimitError(this.config.userLimit);
                }
                song.slug = this.slugGenerator.nextSlug(tx);
                return tx.enqueue(song);
            });

            const timeUntilSong = this.queue.getDurationUntilSong(queued);
            const embed = new EmbedBuilder()
                .setTitle('Added to Queue')
                .setDescription(`[${queued.title}](${song.url})`)
                .addFields(
                    { name: 'Position', value: `#${queued.position + 1}`, inline: true },
                    {
                        name: 'Earliest Play Time',
                        value: timeUntilSong === 0 ? 'Next' :
                               `<t:${Math.floor(Date.now() / 1000) + timeUntilSong}:t>`,
                        inline: true
                    }
                )
                .setThumbnail(song.thumbnail)
                .setColor(colors.primary)
                .setFooter({ text: `Entry ID: ${queued.slug}` });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            if (error instanceof UserLimitError)
                await interaction.editReply(error.message);
            else
                throw error;
        }
    }
}