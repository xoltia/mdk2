package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
)

// type AppConfig = {
//     dbFile: string;
//     discordToken: string;
//     mpvPath: string;
//     ytDlpPath: string;
//     guildId: string;
//     userLimit: number;
//     adminRoles: string[];
//     adminUsers: string[];
//     channelId: string;
//     playbackTimeout: number;
//     screenNumber: number;
//     allowSelfSwap: boolean;
// };

type config struct {
	DiscordToken    string   `json:"discordToken"`
	GuildID         string   `json:"guildId"`
	ChannelID       string   `json:"channelId"`
	AdminRoles      []string `json:"adminRoles,omitempty"`
	AdminUsers      []string `json:"adminUsers,omitempty"`
	PlaybackTimeout int      `json:"playbackTimeout"`
	ScreenNumber    int      `json:"screenNumber"`
	AllowSelfSwap   bool     `json:"allowSelfSwap"`
	UserLimit       int      `json:"userLimit"`

	// Not to be used, will let portable config handle this
	DBFile   string `json:"dbFile,omitempty"`
	MPVPath  string `json:"mpvPath,omitempty"`
	YTDLPath string `json:"ytDlpPath,omitempty"`
}

var configPath = flag.String("config", "config.json", "path to the config file")

func loadConfig() (*config, error) {
	cfg := &config{}
	f, err := os.Open(*configPath)
	if err != nil {
		// set defaults
		cfg.PlaybackTimeout = 45
		cfg.ScreenNumber = 0
		cfg.UserLimit = 1
		return cfg, nil
	}
	defer f.Close()

	err = json.NewDecoder(f).Decode(cfg)
	return cfg, err
}

func validateIsInt(s string) error {
	_, err := strconv.Atoi(s)
	if err != nil {
		return fmt.Errorf("must be a number")
	}
	return nil
}

func main() {
	var cfg *config
	var err error
	err = spinner.New().
		Title("Loading...").
		Action(func() {
			cfg, err = loadConfig()
			if err != nil {
				log.Fatal(err)
			}
		}).
		Run()

	theme := huh.ThemeCatppuccin()

	err = huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("Discord Token").
				Description("Enter your Discord bot token. If you haven't created a bot yet, see the README for instructions.").
				Value(&cfg.DiscordToken),
		),
	).WithTheme(theme).Run()
	if err != nil {
		log.Fatal(err)
	}

	var (
		discord *discordgo.Session
		guilds  []*discordgo.UserGuild
	)

	err = spinner.New().
		Title("Logging in...").
		Action(func() {
			discord, err = discordgo.New("Bot " + cfg.DiscordToken)
			if err != nil {
				log.Fatal(err)
			}

			guilds, err = discord.UserGuilds(200, "", "", false)
			if err != nil {
				log.Fatal(err)
			}
		}).
		Run()

	if err != nil {
		log.Fatal(err)
	}

	if len(guilds) == 0 {
		log.Fatal("No servers found! Add the bot to a server first.")
	}

	var (
		playbackTimeoutString string
		screenNumberString    string
		userLimitString       string
		confirm               bool
	)

	playbackTimeoutString = strconv.Itoa(cfg.PlaybackTimeout)
	screenNumberString = strconv.Itoa(cfg.ScreenNumber)
	userLimitString = strconv.Itoa(cfg.UserLimit)

	err = huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Title("Guild").
				Description("Select the guild the bot will be used in.").
				OptionsFunc(func() []huh.Option[string] {
					var options []huh.Option[string]
					for _, guild := range guilds {
						options = append(options, huh.NewOption(guild.Name, guild.ID))
					}
					return options
				}, nil).
				Value(&cfg.GuildID),
			huh.NewSelect[string]().
				Title("Channel").
				Description("Select the channel the bot will be used in.").
				OptionsFunc(func() []huh.Option[string] {
					if cfg.GuildID == "" {
						return []huh.Option[string]{}
					}
					channels, err := discord.GuildChannels(cfg.GuildID)
					if err != nil {
						log.Fatal(err)
					}

					var options []huh.Option[string]
					var channelNameCounts = make(map[string]int)
					for _, channel := range channels {
						if channel.Type != discordgo.ChannelTypeGuildText {
							continue
						}
						channelNameCounts[channel.Name]++
						isDuplicate := channelNameCounts[channel.Name] > 1
						if isDuplicate {
							options = append(options, huh.NewOption(
								fmt.Sprintf("%s (%s)", channel.Name, channel.ID),
								channel.ID,
							))
						} else {
							options = append(options, huh.NewOption(
								channel.Name,
								channel.ID,
							))
						}
					}
					return options
				}, &cfg.GuildID).
				Value(&cfg.ChannelID),
			huh.NewMultiSelect[string]().
				Title("Admin Roles").
				Description("Select the roles that can manage the bot.").
				OptionsFunc(func() []huh.Option[string] {
					if cfg.GuildID == "" {
						return []huh.Option[string]{}
					}

					roles, err := discord.GuildRoles(cfg.GuildID)
					if err != nil {
						log.Fatal(err)
					}

					var options []huh.Option[string]
					for _, role := range roles {
						options = append(options, huh.NewOption(role.Name, role.ID))
					}
					return options
				}, &cfg.GuildID).
				Value(&cfg.AdminRoles),
			// huh.NewMultiSelect[string]().
			// 	Title("Admin Users").
			// 	Description("Select the users that can control the bot.").
			// 	OptionsFunc(func() []huh.Option[string] {
			// 		if cfg.GuildID == "" {
			// 			return []huh.Option[string]{}
			// 		}

			// 		members, err := discord.GuildMembers(cfg.GuildID, "", 1000)
			// 		if err != nil {
			// 			log.Fatal(err)
			// 		}

			// 		var options []huh.Option[string]
			// 		for _, member := range members {
			// 			options = append(options, huh.NewOption(
			// 				fmt.Sprintf("%s (%s)", member.DisplayName(), member.User.Username),
			// 				member.User.ID,
			// 			))
			// 		}

			// 		return options
			// 	}, &cfg.GuildID).
			// 	Value(&cfg.AdminUsers),
			huh.NewInput().
				Title("Playback Timeout").
				Description("The time in seconds before the bot automatically begins playing the next song.").
				Validate(validateIsInt).
				Value(&playbackTimeoutString),
			huh.NewInput().
				Title("Screen Number").
				Description("The screen number to display the video on (0 for primary).").
				Validate(validateIsInt).
				Value(&screenNumberString),
			huh.NewInput().
				Title("User Limit").
				Description("The maximum number of songs a user can queue at once.").
				Validate(validateIsInt).
				Value(&userLimitString),
			huh.NewSelect[bool]().
				Title("Allow Self Swap").
				Description("Allow users to swap their own songs.").
				Options(huh.NewOption("Yes", true), huh.NewOption("No", false)).
				Value(&cfg.AllowSelfSwap),
			huh.NewConfirm().
				Title("Save this configuration?").
				Value(&confirm),
		),
	).WithTheme(theme).Run()

	if err != nil {
		log.Fatal(err)
	}

	if !confirm {
		fmt.Println("Configuration not saved. Closes in 5 seconds...")
		time.Sleep(5 * time.Second)
		return
	}

	cfg.PlaybackTimeout, _ = strconv.Atoi(playbackTimeoutString)
	cfg.ScreenNumber, _ = strconv.Atoi(screenNumberString)
	cfg.UserLimit, _ = strconv.Atoi(userLimitString)

	f, err := os.Create(*configPath)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	encoder := json.NewEncoder(f)
	encoder.SetIndent("", "  ")
	err = encoder.Encode(cfg)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Config saved! Closes in 5 seconds...")
	time.Sleep(5 * time.Second)
}
