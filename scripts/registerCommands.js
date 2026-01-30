import { ApplicationCommandOptionType, REST, Routes } from 'discord.js';
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
];
async function main() {
    const rest = new REST({ version: '10' }).setToken(config.discordToken);
    await rest.put(Routes.applicationGuildCommands(config.appId, config.guildId), { body: commands });
    console.log('Commands registered for guild', config.guildId);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
