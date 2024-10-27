import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";

export default class MoveCommand implements Command {
    constructor(
        private queue: Queue,
        private adminUsers: string[],
        private adminRoles: string[],
    ) {}

    data = new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move a song by ID to a new position')
        .addStringOption(opt =>
            opt.setName('id')
               .setDescription('The ID of the song to move')
               .setRequired(true),
        )
        .addIntegerOption(opt =>
            opt.setName('position')
                .setDescription('The new position of the song')
               .setRequired(true)
               .setMinValue(1)
        )

    async execute(interaction: CommandInteraction) {
        let roles = interaction.member!.roles;
        if (!Array.isArray(roles)) {
            roles = roles.cache.keys().toArray();
        }
        const isAdminUser = this.adminUsers.includes(interaction.user.id);
        const isAdminRole = roles.some(role => this.adminRoles.includes(role));
        const isAdmin = isAdminUser || isAdminRole;
        if (!isAdmin) {
            await interaction.reply('You do not have permission to move songs.');
            return;
        }

        const id = interaction.options.get('id')!.value as string;
        const position =  interaction.options.get('position')!.value as number;

        const [updatedPosition, errorMsg] = this.queue.transaction(tx => {
            const maxQueuePos = tx.maxQueuePosition();
            const song = tx.getActiveBySlug(id);
            const newPosition = Math.max(0, Math.min(position - 1, maxQueuePos));

            if (!song) return [-1, "Invalid song ID."];
            if (song.dequeuedAt) return [-1, "This song has already been dequeued."];
            if (song.position < 0) [-1, "This song has already been dequeued."];

            tx.moveSong(song, newPosition);
            return [newPosition + 1, null];
        });

        await interaction.reply(errorMsg ?? `Song with ID ${id} moved to position ${updatedPosition}.`);
    }
}