const { Client, Intents } = require('discord.js');

const {
    DISCORD_SPIFFO_SECRET,
    DISCORD_CHANNEL_ID,
    DISCORD_CHANNEL_SERVER_NOTIFICATIONS_ID,
    DISCORD_CHANNEL_ALL_ID,
    DISCORD_ROLE_SERVER_NOTIFICATIONS_ID,
} = require('./config.json');

const spiffoClient = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

const allClient = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

exports.initializeBots = function () {
    return new Promise((resolve, reject) => {
        let resolved = 0;

        async function handleClientReady() {
            resolved++;

            if (resolved === 2) {
                resolve();
            }
        }

        spiffoClient.once('ready', handleClientReady);

        allClient.once('ready', handleClientReady);

        spiffoClient.on('messageCreate', async (message) => {
            if (message.channelId === DISCORD_CHANNEL_SERVER_NOTIFICATIONS_ID) {
                const channel = await spiffoClient.channels.fetch(
                    DISCORD_CHANNEL_ALL_ID
                );

                const trimmedMessage = message.content.replace(
                    `<@&${DISCORD_ROLE_SERVER_NOTIFICATIONS_ID}> `,
                    ''
                );

                channel.send(trimmedMessage);
            }
        });

        spiffoClient.login(DISCORD_SPIFFO_SECRET);
        allClient.login(DISCORD_SPIFFO_SECRET);
    });
};

exports.sendModUpdates = async function (modUpdates) {
    const channel = await spiffoClient.channels.fetch(DISCORD_CHANNEL_ID);

    let message = `**Mod activity detected.**\n\n${
        modUpdates.length === 1 ? 'This' : 'These'
    } mod${modUpdates.length === 1 ? '' : 's'} require${
        modUpdates.length === 1 ? 's' : ''
    } update:\n`;

    modUpdates.forEach((modUpdate) => {
        message += `\n- ${modUpdate.title} (${modUpdate.url})`;
    });

    channel.send(message);
};
