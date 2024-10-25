import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    CommandInteraction,
    ComponentType,
    EmbedBuilder,
    SlashCommandBuilder,
    type APIEmbed,
} from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";
import type { QueuedSong } from '../queue';

function truncateString(str: string, max: number, suffix='...'): string {
    if (str.length <= max)
        return str;
    if (suffix.length >= max)
        throw new Error('Max should be <= suffix length');

    return str.slice(0, max - suffix.length) + suffix;
}

export default class ListCommand implements Command {
    constructor(
        private queue: Queue,
    ) {}

    data = new SlashCommandBuilder()
        .setName('list')
        .setDescription('List the songs in the queue');
        // .addUserOption(option =>
        //     option.setName('user')
        //         .setDescription('The user to list the songs for')
        //         .setRequired(false)
        // );
        
    async getPage(page: number, pageSize: number): Promise<[QueuedSong[], boolean]> {
        const offset = (page - 1) * pageSize;
        const [songs, total] = await this.queue.transaction(tx => {
            const songs = tx.findQueued(pageSize, offset);
            const total = tx.countQueued();
            return [songs, total];
        });
        const hasMore = total > offset + songs.length;
        return [songs, hasMore];
    }

    async getEmbed(page: number, pageSize: number): Promise<[APIEmbed, boolean]> {
        const [songs, hasMore] = await this.getPage(page, pageSize);
        const embed = new EmbedBuilder();
        embed.setTitle('Queue');
        for (const song of songs) {
            embed.addFields({
                name: truncateString(
                    `${song.position + 1}. ${song.title}`,
                    256,
                ),
                value: `ID: ${song.id} | Queued By: <@${song.userId}>`,
            });
        }
        if (!songs.length)
            embed.setDescription('Nothing to see on this page');
        embed.setFooter({ text: `Page ${page}` });
        return [embed.toJSON(), hasMore];
    }

    async execute(interaction: CommandInteraction) {
        await interaction.deferReply();

        const pageSize = 5;
        let page = 1;

        const [embed, hasMore] = await this.getEmbed(page, pageSize);
        // if (!hasMore) {
        //     await interaction.editReply({ embeds: [embed] });
        //     return;
        // }

        const nextButton = new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary);

        const previousButton = new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary);

        const refreshButton = new ButtonBuilder()
            .setCustomId('refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary);

        const components = [
            previousButton,
            refreshButton,
            nextButton,
        ];

        if (!hasMore)
            components.pop();
        if (page === 1)
            components.shift();

        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(components);
        const response = await interaction.editReply({ embeds: [embed], components: [actionRow] });
       
        const filter = (i: ButtonInteraction) => i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter,
            time: 2 * 60 * 1000,
        });

        collector.on('collect', async i => {
            if (i.customId === 'next') {
                page++;
            } else if (i.customId === 'previous') {
                page--;
            }

            const [embed, hasMore] = await this.getEmbed(page, pageSize);
            const hasPrevious = page > 1;
            const hasNext = hasMore;
            const components = [
                hasPrevious ? previousButton : undefined,
                refreshButton,
                hasNext ? nextButton : undefined,
            ].filter(c => typeof c !== 'undefined');

            await i.update({
                embeds: [embed],
                components: [
                    new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(...components)
                ]
            });
        });

        collector.on('end', async () => {
            await interaction.editReply({ components: [] });
        });
    }
}