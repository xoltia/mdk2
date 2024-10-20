type AppConfig = {
    dbFile: string;
    discordToken: string;
    mpvPath: string;
    ytDlpPath: string;
    guildId: string;
};

const DEFAULT_CONFIG: AppConfig = {
    dbFile: 'queue.sqlite',
    discordToken: '',
    mpvPath: 'mpv',
    ytDlpPath: 'yt-dlp',
    guildId: '',
};

const ENV_VAR_MAP: Record<keyof AppConfig, string> = {
    dbFile: 'DB_FILE_NAME',
    discordToken: 'DISCORD_TOKEN',
    mpvPath: 'MPV_PATH',
    ytDlpPath: 'YT_DLP_PATH',
    guildId: 'GUILD_ID',
};

export async function loadConfig(): Promise<AppConfig> {
    const config: AppConfig = { ...DEFAULT_CONFIG };

    for (const key of Object.keys(ENV_VAR_MAP)) {
        const envVar = ENV_VAR_MAP[key as keyof AppConfig];
        if (process.env[envVar]) {
            config[key as keyof AppConfig] = process.env[envVar]!;
        }
    }

    const file = Bun.file('config.json');
    if (!(await file.exists()))
        return config;
    const data = await file.json();

    for (const key of Object.keys(DEFAULT_CONFIG)) {
        //console.log(data[key], key);
        if (data[key]) {
            config[key as keyof AppConfig] = data[key];
        }
    }

    return config;
}
