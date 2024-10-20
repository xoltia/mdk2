import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";
import { getVideoInfo, type YtDlpOptions } from '../yt-dlp';
import type { NewSong } from '../queue';

export default class QueueCommand implements Command {
    constructor(private queue: Queue, private ytDlpOptions: YtDlpOptions) {}

    data = new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Add a song to the queue')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the song to add')
                .setRequired(true)
        );
        

    async execute(interaction: CommandInteraction) {
        await interaction.deferReply();

        const url = interaction.options.get('url')!.value as string;
        const songInfo = await getVideoInfo(url, this.ytDlpOptions);
        const song: NewSong = {
            title: songInfo.title,
            url: songInfo.url,
            duration: songInfo.duration,
            thumbnail: songInfo.thumbnail,
            userId: interaction.user.id,
        };

        const queued = await this.queue.transaction(tx => tx.enqueue(song));
        await interaction.editReply(`Your song **${queued.title}** is number **${queued.position + 1}** in the queue.`);
    }
}