package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"

	"github.com/bwmarrin/discordgo"
	"github.com/charmbracelet/huh"
	"github.com/charmbracelet/huh/spinner"
	"github.com/charmbracelet/lipgloss"
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

func customTheme() *huh.Theme {
	t := huh.ThemeBase()

	var (
		primaryColor   = lipgloss.Color("#f9cdde")
		secondaryColor = lipgloss.Color("#b5e0e7")
		cursorColor    = lipgloss.Color("#f9cdde")
		errColor       = lipgloss.Color("f55151")
		selectedColor  = lipgloss.Color("#f9cdde")
	)

	t.Focused.Title = t.Focused.Title.Foreground(primaryColor)
	t.Focused.NoteTitle = t.Focused.NoteTitle.Foreground(primaryColor)
	t.Focused.Directory = t.Focused.Directory.Foreground(primaryColor)
	t.Focused.ErrorIndicator = t.Focused.ErrorIndicator.Foreground(errColor)
	t.Focused.ErrorMessage = t.Focused.ErrorMessage.Foreground(errColor)
	t.Focused.SelectSelector = t.Focused.SelectSelector.Foreground(secondaryColor)
	t.Focused.NextIndicator = t.Focused.NextIndicator.Foreground(secondaryColor)
	t.Focused.PrevIndicator = t.Focused.PrevIndicator.Foreground(secondaryColor)
	t.Focused.MultiSelectSelector = t.Focused.MultiSelectSelector.Foreground(secondaryColor)
	t.Focused.SelectedOption = t.Focused.SelectedOption.Foreground(selectedColor)
	t.Focused.SelectedPrefix = t.Focused.SelectedPrefix.Foreground(selectedColor)
	t.Focused.TextInput.Cursor = t.Focused.TextInput.Cursor.Foreground(cursorColor)
	t.Focused.TextInput.Prompt = t.Focused.TextInput.Prompt.Foreground(secondaryColor)

	var (
		base     = lipgloss.Color("#282a36")
		text     = lipgloss.Color("#9fa6d4")
		subtext0 = lipgloss.Color("#6272a4")
		subtext1 = lipgloss.Color("#44475a")
		overlay0 = lipgloss.Color("#f8f8f2")
		overlay1 = lipgloss.Color("#f8f8f2")
	)

	t.Focused.Base = t.Focused.Base.BorderForeground(subtext1)
	t.Focused.Description = t.Focused.Description.Foreground(subtext0)
	t.Focused.Option = t.Focused.Option.Foreground(text)
	t.Focused.UnselectedPrefix = t.Focused.UnselectedPrefix.Foreground(text)
	t.Focused.UnselectedOption = t.Focused.UnselectedOption.Foreground(text)
	t.Focused.FocusedButton = t.Focused.FocusedButton.Foreground(base).Background(secondaryColor)
	t.Focused.BlurredButton = t.Focused.BlurredButton.Foreground(text).Background(base)
	t.Focused.TextInput.Placeholder = t.Focused.TextInput.Placeholder.Foreground(overlay0)
	t.Blurred = t.Focused
	t.Blurred.Base = t.Blurred.Base.BorderStyle(lipgloss.HiddenBorder())
	t.Help.Ellipsis = t.Help.Ellipsis.Foreground(subtext0)
	t.Help.ShortKey = t.Help.ShortKey.Foreground(subtext0)
	t.Help.ShortDesc = t.Help.ShortDesc.Foreground(overlay1)
	t.Help.ShortSeparator = t.Help.ShortSeparator.Foreground(subtext0)
	t.Help.FullKey = t.Help.FullKey.Foreground(subtext0)
	t.Help.FullDesc = t.Help.FullDesc.Foreground(overlay1)
	t.Help.FullSeparator = t.Help.FullSeparator.Foreground(subtext0)
	return t
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

	theme := customTheme()

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

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)

	if !confirm {
		fmt.Println("Configuration not saved. You may now close this window.")
		<-c
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

	fmt.Println("Config saved! You may now close this window.")
	<-c
}
