import { CommandInteraction, SharedSlashCommand } from 'discord.js';

export interface Command {
    data: SharedSlashCommand;
    execute: (interaction: CommandInteraction) => Promise<void>;
};
