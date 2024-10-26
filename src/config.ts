type AppConfig = {
    dbFile: string;
    discordToken: string;
    mpvPath: string;
    ytDlpPath: string;
    guildId: string;
    userLimit: number;
    adminRoles: string[];
    adminUsers: string[];
    channelId: string;
    playbackTimeout: number;
    screenNumber: number;
};

const DEFAULT_CONFIG: AppConfig = {
    dbFile: 'queue.sqlite',
    discordToken: '',
    mpvPath: 'mpv',
    ytDlpPath: 'yt-dlp',
    guildId: '',
    userLimit: 1,
    adminRoles: [],
    adminUsers: [],
    channelId: '',
    playbackTimeout: 60,
    screenNumber: 0,
};

// const ENV_VAR_MAP: Record<keyof AppConfig, string> = {
//     dbFile: 'DB_FILE_NAME',
//     discordToken: 'DISCORD_TOKEN',
//     mpvPath: 'MPV_PATH',
//     ytDlpPath: 'YT_DLP_PATH',
//     guildId: 'GUILD_ID',
// };

export async function loadConfig(): Promise<AppConfig> {
    const config: AppConfig = { ...DEFAULT_CONFIG };

    // for (const key of Object.keys(ENV_VAR_MAP)) {
    //     const envVar = ENV_VAR_MAP[key as keyof AppConfig];
    //     if (process.env[envVar]) {
    //         config[key as keyof AppConfig] = process.env[envVar]!;
    //     }
    // }

    const file = Bun.file('config.json');
    if (!(await file.exists()))
        return config;
    const data = await file.json();
    return { ...config, ...data };
}
