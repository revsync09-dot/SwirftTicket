import { ApplicationCommandOptionType, REST, Routes, ChannelType } from 'discord.js';
import { config } from '../src/config.js';
const commands = [
    {
        name: 'ticket',
        description: 'Ticket actions',
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'create',
                description: 'Create a new support ticket',
                options: [
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'reason',
                        description: 'What do you need help with?',
                        required: true,
                    },
                ],
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'setup',
                description: 'Configure ticket parent channel and staff role for this server',
                options: [
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: 'parent',
                        description: 'Category or channel to host tickets',
                        required: true,
                        channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
                    },
                    {
                        type: ApplicationCommandOptionType.Role,
                        name: 'staff_role',
                        description: 'Role allowed to claim/close tickets',
                        required: true,
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'timezone',
                        description: 'Timezone (IANA) for timestamps, e.g., UTC or Europe/Berlin',
                        required: false,
                    },
                ],
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'panel',
                description: 'Post the ticket settings panel (category slots)',
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'panelset',
                description: 'Post the public ticket panel (category select)',
                options: [
                    {
                        type: ApplicationCommandOptionType.Channel,
                        name: 'channel',
                        description: 'Channel to post the ticket panel in',
                        required: false,
                        channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
                    },
                ],
            },
        ],
    },
    {
        name: 'info',
        description: 'Show ticket analytics for a user',
        options: [
            {
                type: ApplicationCommandOptionType.User,
                name: 'user',
                description: 'Target user (defaults to you)',
                required: false,
            },
        ],
    },
    {
        name: 'ping',
        description: 'Show bot status',
    },
    {
        name: 'mod',
        description: 'Moderation utilities',
        options: [
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'log',
                description: 'Log a moderation action for history',
                options: [
                    {
                        type: ApplicationCommandOptionType.User,
                        name: 'user',
                        description: 'Target user',
                        required: true,
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'action',
                        description: 'Action type',
                        required: true,
                        choices: [
                            { name: 'Warn', value: 'WARN' },
                            { name: 'Mute', value: 'MUTE' },
                            { name: 'Ban', value: 'BAN' },
                        ],
                    },
                    {
                        type: ApplicationCommandOptionType.String,
                        name: 'reason',
                        description: 'Reason (optional)',
                        required: false,
                    },
                ],
            },
            {
                type: ApplicationCommandOptionType.Subcommand,
                name: 'config',
                description: 'Configure auto-timeout for warnings',
                options: [
                    {
                        type: ApplicationCommandOptionType.Integer,
                        name: 'warn_threshold',
                        description: 'Warnings before timeout (1-50)',
                        required: true,
                        min_value: 1,
                        max_value: 50,
                    },
                    {
                        type: ApplicationCommandOptionType.Integer,
                        name: 'timeout_minutes',
                        description: 'Timeout duration in minutes (1-10080)',
                        required: true,
                        min_value: 1,
                        max_value: 10080,
                    },
                ],
            },
        ],
    },
];
async function main() {
    const rest = new REST({ version: '10' }).setToken(config.discordToken);
    const currentApp = (await rest.get(Routes.oauth2CurrentApplication()));
    const appId = currentApp.id;
    if (config.appId !== appId) {
        console.log(`Warning: DISCORD_APP_ID does not match token app (${config.appId} != ${appId}). Using token app.`);
    }
    const guildId = process.env.GUILD_ID;
    if (guildId) {
        await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
        console.log('Guild commands registered for', guildId);
    }
    else {
        await rest.put(Routes.applicationCommands(appId), { body: commands });
        console.log('Global commands registered');
    }
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
