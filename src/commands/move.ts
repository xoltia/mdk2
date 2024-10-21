import { CommandInteraction, SlashCommandBuilder } from 'discord.js';
import { type Command } from "./base";
import type Queue from "../queue";

export default class MoveCommand implements Command {
    constructor(
        private queue: Queue,
    ) {}

    data = new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move a song by ID to a new position')
        .addIntegerOption(opt =>
            opt.setName('id')
               .setRequired(true)
               .setMinValue(1)
        )
        .addIntegerOption(opt =>
            opt.setName('position')
               .setRequired(true)
               .setMinValue(1)
        )

    async execute(interaction: CommandInteraction) {
        const id = interaction.options.get('id')!.value as number;
        const position =  interaction.options.get('position')!.value as number;

        const errorMsg = await this.queue.transaction(tx => {
            const maxQueuePos = tx.maxQueuePosition();
            const song = tx.findById(id);
            const newPosition = Math.max(0, Math.min(position - 1, maxQueuePos));

            if (!song) return "Invalid song ID.";
            if (song.position < 0) "This song has already been dequeued.";

            tx.moveSong(song, newPosition);
        });

        await interaction.reply(errorMsg ?? `Song with ID ${id} moved to position ${position}`);
    }
}