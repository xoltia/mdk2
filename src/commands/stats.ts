import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";
import type { QueueStats } from '../queue';
import colors from '../colors';

function formatDuration(duration: number, precision = 0): string {
    const seconds = duration % 60;
    const minutes = Math.floor(duration / 60) % 60;
    const hours = Math.floor(duration / 3600);
    let result = '';
    if (hours > 0)
        result += `${hours}h`;
    if (minutes > 0)
        result += `${minutes}m`;
    result += `${seconds.toFixed(precision)}s`;
    return result;
}

function predictEndTime(stats: QueueStats): number {
    const nowSeconds = Date.now() / 1000;
    const likelyWaitTime = stats.dequeuedWaitDurationMean * stats.enqueuedCount;
    const predictedEndTime = nowSeconds + stats.enqueuedDurationTotal + likelyWaitTime;
    return predictedEndTime;
}

export default class StatsCommand implements Command {
    constructor(private queue: Queue) {}

    data = new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show queue statistics');

    async execute(interaction: CommandInteraction) {
        const stats = this.queue.stats();
        const embed = new EmbedBuilder()
            .setTitle('Queue Stats')
            .setDescription('Statistics for the current queue')
            .setFields(
                {
                    name: 'Played Songs',
                    value: `${stats.dequeuedCount} (${formatDuration(stats.dequeuedDurationTotal)})`,
                },
                {
                    name: 'Queued Songs',
                    value: `${stats.enqueuedCount} (${formatDuration(stats.enqueuedDurationTotal)})`,
                },
                {
                    name: 'Average Standby Time',
                    value: `${formatDuration(stats.dequeuedWaitDurationMean)} (σ ${formatDuration(stats.dequeueWaitDurationdStdDev, 1)})`,
                },
                {
                    name: 'Estimated End Time',
                    value: `<t:${predictEndTime(stats).toFixed()}:R>`,
                },
            )
            .setColor(colors.secondary)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
}