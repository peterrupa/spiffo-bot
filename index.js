const axios = require('axios');
const cheerio = require('cheerio');
const PromiseThrottle = require('promise-throttle');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const _ = require('lodash');

const { initializeBot, sendModUpdates } = require('./discord');

dayjs.extend(timezone);
dayjs.extend(customParseFormat);

dayjs.tz.setDefault('Asia/Manila');

const ROOT_PAGE_URL =
    'https://steamcommunity.com/profiles/76561198077301146/myworkshopfiles/?appid=108600&browsefilter=myfavorites&sortmethod=lastupdated&browsesort=myfavorites';

const MOD_PAGE_URL = 'https://steamcommunity.com/sharedfiles/filedetails';

const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 mins

const STANDARD_DATE_FORMAT = 'D MMM YYYY h:mma';
const STANDARD_DATE_FORMAT_US = 'MMM D YYYY h:mma';

axios.defaults.headers.common = {
    Cookie: 'timezoneOffset=28800,0',
};

main();

async function main() {
    await initializeBot();

    log('Spiffo bot online.');

    let modsList = null;

    poll();

    async function poll() {
        try {
            const updatedModsList = await scrapePage(1);

            const newMods = await checkForModChanges(modsList, updatedModsList);

            if (newMods.length) {
                if (modsList !== null) {
                    log('Mod changes detected.');

                    newMods.forEach((mod) => {
                        log(
                            `${mod.title} (${mod.id}) - ${dayjs(
                                mod.lastUpdated
                            ).format(STANDARD_DATE_FORMAT)}`
                        );
                    });

                    sendModUpdates(newMods);
                }

                modsList = updatedModsList;
            }
        } catch (e) {
            console.error(e);
        } finally {
            setTimeout(poll, UPDATE_INTERVAL);
        }
    }
}

async function checkForModChanges(prevModsList = [], updatedModsList, i) {
    const newMods = _.differenceWith(updatedModsList, prevModsList, (a, b) => {
        return a.id === b.id && dayjs(a.lastUpdated).isSame(b.lastUpdated);
    });

    return newMods;
}
async function scrapePage(pageNumber) {
    try {
        const response = await axios.get(`${ROOT_PAGE_URL}&p=${pageNumber}`);

        const modAppIds = getModAppIds(response.data);

        const promiseThrottle = new PromiseThrottle({
            requestsPerSecond: 1,
            promiseImplementation: Promise,
        });

        const promises = modAppIds.map((modAppId) =>
            promiseThrottle.add(getModMetadata.bind(this, modAppId))
        );

        const modMetadata = await Promise.all(promises);

        return modAppIds.map((modAppId, i) => ({
            id: modAppId,
            title: modMetadata[i].title,
            lastUpdated: modMetadata[i].lastUpdated,
        }));
    } catch (e) {
        throw new Error(
            `Something wrong happened trying to scrape page ${pageNumber}.`
        );
    }
}

function getModAppIds(html) {
    const $ = cheerio.load(html);

    const modAppIds = Array.from(
        $('a[data-publishedfileid]').map((i, el) =>
            $(el).attr('data-publishedfileid')
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

        return {
            title,
            url: modUrl,
            lastUpdated: dayjs(`${dateText} ${timeText}`, dateFormat),
        };
    } catch (e) {
        throw new Error(
            `Something wrong happened trying to scrape mod ${modAppId}.`
        );
    }
}

function getCurrentYear() {
    return dayjs().year();
}

function log(message) {
    const timestamp = dayjs().format(STANDARD_DATE_FORMAT);

    console.log(`[${timestamp}] ${message}`);
}
