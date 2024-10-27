import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";

export default class RemoveCommand implements Command {
    constructor(
        private queue: Queue,
        private adminUsers: string[],
        private adminRoles: string[],
    ) {}

    data = new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a song from the queue')
        .addIntegerOption(opt =>
            opt.setName('id')
                .setDescription('The ID of the song to remove')
               .setRequired(true)
               .setMinValue(1)
        )

    async execute(interaction: CommandInteraction) {
        let roles = interaction.member!.roles;
        if (!Array.isArray(roles))
            roles = roles.cache.keys().toArray();
        const isAdminUser = this.adminUsers.includes(interaction.user.id);
        const isAdminRole = roles.some(role => this.adminRoles.includes(role));
        const isAdmin = isAdminUser || isAdminRole;

        const id = interaction.options.get('id')!.value as number;
        const errorMsg = this.queue.transaction(tx => {
            const song = tx.findById(id);
            if (!song)
                return "Invalid song ID.";
            if (!isAdmin && song.userId !== interaction.user.id)
                return "You do not have permission to remove this song.";
            if (song.dequeuedAt)
                return "This song has already been dequeued.";
            if (song.position < 0)
                return "This song has already been dequeued.";
            tx.remove(song.id);
        });

        await interaction.reply(errorMsg ?? 'Song removed.');
    }
}