import { openDb } from "./db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import Queue from "./queue";
import QueueCommand from "./commands/queue";
import { Client, Events, REST, Routes } from "discord.js";
import type { Command } from "./commands/base";
import { loadConfig } from "./config";
import ListCommand from "./commands/list";
import { MPV } from "./mpv";
import MoveCommand from "./commands/move";
import SwapCommand from "./commands/swap";
import RemoveCommand from "./commands/remove";
import StatsCommand from "./commands/stats";
import { unlink } from "fs/promises";
import { join as joinPath, basename } from "path";
import { select, confirm } from "@inquirer/prompts";
import PurgeCommand from "./commands/purge";
import { loopTryPlayNext } from "./playLoop";

const config = await loadConfig();

// If the database already exists, ask the user if they want to start a new queue
const dbFile = Bun.file(config.dbFile);
const backupPath = joinPath('backup', `${Date.now()}.sqlite3.bak`);
const backupGlob = new Bun.Glob('backup/*.sqlite3.bak');
const backupFiles = await Array.fromAsync(backupGlob.scan());
const hasBackups = backupFiles.length > 0;
const hasDb = await dbFile.exists();

if (hasDb || hasBackups) {
    const choices = [{ name: 'Start a new queue', value: 'newQueue' }];
    if (hasDb)
        choices.unshift({ name: 'Continue existing queue', value: 'continueQueue' });
    if (hasBackups)
        choices.push({ name: 'Restore from backup', value: 'restoreBackup' });

    const result = await select({
        message: 'What would you like to do?',
        choices,
    });

    if (result === 'newQueue') {
        const confirmed = await confirm({
            message: 'Make sure there are no other instances of the bot running. Are you sure you want to start a new queue?',
        });
        if (!confirmed)
            process.exit(0);
        await Bun.write(backupPath, dbFile);
        await unlink(config.dbFile);
    } else if (result === 'restoreBackup') {
        const backupChoices = backupFiles.map(backup => {
            const filename = basename(backup);
            const date = new Date(parseInt(filename.split('.')[0]));
            return {
                name: date.toLocaleString(),
                value: backup,
            };
        });
        const backupFile = await select({
            message: 'Select a backup to restore',
            choices: backupChoices,
        });
        const confirmed = await confirm({
            message: `This action will overwrite the current database. Do you want to continue?`,
        });
        if (!confirmed)
            process.exit(0);
        await Bun.write(dbFile, Bun.file(backupFile));
    }
}

const db = openDb(config.dbFile);
migrate(db, { migrationsFolder: "./drizzle" });

const queue = new Queue(db);
const commands: Command[] = [
    new QueueCommand(queue, {
        userLimit: config.userLimit,
        rolesExempt: config.adminRoles,
        usersExempt: config.adminUsers,
        ytDlpOptions: { ytDlpPath: config.ytDlpPath },
    }),
    new ListCommand(queue),
    new MoveCommand(queue, config.adminUsers, config.adminRoles),
    new SwapCommand(queue, {
        adminRoles: config.adminRoles,
        adminUsers: config.adminUsers,
        allowSelfSwap: config.allowSelfSwap,
        ytDlpOptions: { ytDlpPath: config.ytDlpPath },
    }),
    new RemoveCommand(queue, config.adminUsers, config.adminRoles),
    new StatsCommand(queue),
    new PurgeCommand(queue, config.adminUsers, config.adminRoles),
];

const client = new Client({ intents: ['Guilds', 'GuildMembers'] });
const token = config.discordToken;
if (!token)
    throw new Error('Missing DISCORD_TOKEN env var');

client.once(Events.ClientReady, async () => {
    console.log('Ready!');
    const rest = new REST({ version: '9' }).setToken(token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(client.user!.id, config.guildId),
            { body: commands.map(command => command.data.toJSON()) },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    
    const mpv = new MPV(config.mpvPath, config.screenNumber);
    await mpv.start();
    await mpv.scriptMessage('osc-idlescreen', 'no');
    console.log('MPV started, do not close the MPV window!');
    console.log('To stop the bot, close this terminal window.');
    
    loopTryPlayNext(mpv, queue, client, config, 1000);

    mpv.on('exit', () => {
        console.error('MPV process exited. Exiting.');
        process.exit(1);
    });
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const command = commands.find(c => c.data.name === interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
    }
});

client.login(token);
