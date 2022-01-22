const { Client, Intents } = require('discord.js');

const { DISCORD_SECRET, DISCORD_CHANNEL_ID } = require('./config.json');

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

exports.initializeBot = function () {
    return new Promise((resolve, reject) => {
        client.once('ready', async () => {
            resolve();
        });

        client.login(DISCORD_SECRET);
    });
};

exports.sendModUpdates = async function (modUpdates) {
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);

    let message = `**Mod activity detected.**\n\n${
        modUpdates.length === 1 ? 'This' : 'These'
    } mod require${modUpdates.length === 1 ? 's' : ''} update:\n`;

    modUpdates.forEach((modUpdate) => {
        message += `\n- ${modUpdate.title} (${modUpdate.url})`;
    });

    channel.send(message);
};
