const axios = require('axios');
const cheerio = require('cheerio');
const PromiseThrottle = require('promise-throttle');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const _ = require('lodash');
const schedule = require('node-schedule');

const {
    initializeBots,
    sendModUpdates,
    sendMessageToAll,
} = require('./discord');

dayjs.extend(timezone);
dayjs.extend(customParseFormat);

dayjs.tz.setDefault('Asia/Manila');

const ROOT_PAGE_URL =
    'https://steamcommunity.com/sharedfiles/filedetails/?edit=true&id=2731058267';

const MOD_PAGE_URL = 'https://steamcommunity.com/sharedfiles/filedetails';

const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 mins

const STANDARD_DATE_FORMAT = 'D MMM YYYY h:mma';
const STANDARD_DATE_FORMAT_US = 'MMM D YYYY h:mma';

axios.defaults.headers.common = {
    Cookie: 'timezoneOffset=28800,0',
};

main();

async function main() {
    log('Initializing bots.');

    await initializeBots();

    initializeReminders();

    log('Spiffo bot online.');

    let modsList = null;

    poll();

    async function poll() {
        try {
            log('Scanning started.');

            const updatedModsList = await scrapeMods();

            log('Scanning done.');

            const newMods = await checkForModChanges(modsList, updatedModsList);

            if (newMods.length) {
                if (modsList !== null) {
                    log('Mod activity detected.');

                    newMods.forEach((mod) => {
                        log(
                            `${mod.title} (${mod.id}) - ${dayjs(
                                mod.lastUpdated
                            ).format(STANDARD_DATE_FORMAT)}`
                        );
                    });

                    sendModUpdates(newMods);
                }

                if (modsList !== null) {
                    modsList = updatedModsList.map((updatedMod, i) =>
                        updatedMod.title
                            ? updatedMod
                            : modsList.find((mod) => mod.id === updatedMod.id)
                    );
                } else {
                    modsList = updatedModsList;
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setTimeout(poll, UPDATE_INTERVAL);
        }
    }
}

async function checkForModChanges(prevModsList = [], updatedModsList, i) {
    if (!prevModsList) {
        prevModsList = [];
    }

    let newMods = _.differenceWith(updatedModsList, prevModsList, (a, b) => {
        return a.id === b.id && dayjs(a.lastUpdated).isSame(b.lastUpdated);
    });

    newMods = newMods.filter((newMod) => !!newMod.lastUpdated);

    return newMods;
}
async function scrapeMods() {
    try {
        const response = await axios.get(ROOT_PAGE_URL);

        const modAppIds = getModAppIds(response.data);

        const promiseThrottle = new PromiseThrottle({
            requestsPerSecond: 5,
            promiseImplementation: Promise,
        });

        const promises = modAppIds.map((modAppId) =>
            promiseThrottle.add(getModMetadata.bind(this, modAppId))
        );

        const modMetadata = (await Promise.allSettled(promises)).map(
            (promise) =>
                promise.status === 'fulfilled'
                    ? promise.value
                    : {
                          title: null,
                          url: null,
                          lastUpdated: null,
                      }
        );

        return modAppIds.map((modAppId, i) => ({
            id: modAppId,
            title: modMetadata[i].title,
            url: modMetadata[i].url,
            lastUpdated: modMetadata[i].lastUpdated,
        }));
    } catch (e) {
        console.error(e);
        throw new Error(`Something wrong happened trying to scrape mods.`);
    }
}

function getModAppIds(html) {
    const $ = cheerio.load(html);

    const modAppIds = Array.from(
        $('.collectionItem').map((i, el) =>
            $(el).attr('id').replace('sharedfile_', '')
        )
    );

    return modAppIds;
}

async function getModMetadata(modAppId) {
    try {
        const modUrl = `${MOD_PAGE_URL}/?id=${modAppId}`;

        const response = await axios.get(modUrl);

        const $ = cheerio.load(response.data);

        const dateTimeText = $('.detailsStatRight:nth-child(3)').text();

        let [dateText, timeText] = dateTimeText.split(' @ ');

        // check if year exists
        if (!/\d\d\d\d/.test(dateText)) {
            dateText = `${dateText}, ${getCurrentYear()}`;
        }

        // remove the comma because it messes with the parsing
        dateText = dateText.replace(',', '');

        const title = $('.workshopItemTitle').text();

        let dateFormat = STANDARD_DATE_FORMAT;

        if (/^[a-zA-Z]/.test(dateText)) {
            dateFormat = STANDARD_DATE_FORMAT_US;
        }

        let lastUpdated = dayjs(`${dateText} ${timeText}`, dateFormat);

        return {
            title,
            url: modUrl,
            lastUpdated: lastUpdated.isValid()
                ? lastUpdated
                : dayjs('2000-1-1'),
        };
    } catch (e) {
        console.error(e);
        throw new Error(
            `Something wrong happened trying to scrape mod ${modAppId}.`
        );
    }
}

function initializeReminders() {
    const reminder10MinsRemainingText =
        'Server restart in 10 mins. This is an automated message.';
    const reminder5MinsRemainingText =
        'Server restart in 5 mins. Seek shelter. This is an automated message.';
    const reminder1MinRemainingText =
        'Server restart in 1 min. Stay safe. survivors!';

    function remind10MinsRemaining() {
        log('Sending reminder - 10 mins remaining');

        sendMessageToAll(reminder10MinsRemainingText);
    }

    function remind5MinsRemaining() {
        log('Sending reminder - 5 mins remaining');

        sendMessageToAll(reminder5MinsRemainingText);
    }

    function remind1MinRemaining() {
        log('Sending reminder - 1 min remaining');

        sendMessageToAll(reminder1MinRemainingText);
    }

    // 10 mins remaining
    schedule.scheduleJob('0 50 6 * * *', remind10MinsRemaining);
    schedule.scheduleJob('0 50 18 * * *', remind10MinsRemaining);

    // 5 mins remaining
    schedule.scheduleJob('0 55 6 * * *', remind5MinsRemaining);
    schedule.scheduleJob('0 55 18 * * *', remind5MinsRemaining);

    // 1 min remaining
    schedule.scheduleJob('0 59 6 * * *', remind1MinRemaining);
    schedule.scheduleJob('0 59 18 * * *', remind1MinRemaining);
}

function getCurrentYear() {
    return dayjs().year();
}

function log(message) {
    const timestamp = dayjs().format(STANDARD_DATE_FORMAT);

    console.log(`[${timestamp}] ${message}`);
}
