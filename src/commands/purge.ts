import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";

export default class PurgeCommand implements Command {
    constructor(
        private queue: Queue,
        private adminUsers: string[],
        private adminRoles: string[],
    ) {}

    data = new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Remove all of a user\'s songs from the queue')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user whose songs to remove')
                .setRequired(true)
        )

    async execute(interaction: CommandInteraction) {
        const user = interaction.options.get('user')!.user!;
        let roles = interaction.member!.roles;
        if (!Array.isArray(roles))
            roles = roles.cache.keys().toArray();
        const isAdminUser = this.adminUsers.includes(interaction.user.id);
        const isAdminRole = roles.some(role => this.adminRoles.includes(role));
        const isAdmin = isAdminUser || isAdminRole;
        if (interaction.user.id !== user.id && !isAdmin) {
            await interaction.reply("You do not have permission to purge another user's songs.");
            return;
        }

        this.queue.transaction(tx => {
            const songs = tx.findByUserId(user.id);
            for (const song of songs) {
                if (song.dequeuedAt)
                    continue;
                tx.remove(song.id);
            }
        });

        await interaction.reply('Purged user\'s songs.');
    }
}