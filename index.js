const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function loginToFacebook(email, password, userAgent, proxy) {
    let browser;
    try {
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-dev-shm-usage'
            ]
        };

        if (proxy) {
            launchOptions.args.push(`--proxy-server=${proxy}`);
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        if (userAgent) {
            await page.setUserAgent(userAgent);
        } else {
            await page.setUserAgent(DEFAULT_USER_AGENT);
        }

        await page.goto('https://www.facebook.com/');
        await page.type('#email', email, { delay: 100 });
        await page.type('#pass', password, { delay: 100 });

        await Promise.all([
            page.click('[name="login"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
        ]);

        const cookies = await page.cookies();
        const loginFailed = await page.$('input[name="email"]');
        if (loginFailed) {
            await browser.close();
            return { error: 'Wrong username or password. Please try again.' };
        }

        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        const jsonCookies = cookies.map(cookie => ({
            domain: cookie.domain,
            expirationDate: cookie.expires,
            hostOnly: cookie.hostOnly,
            httpOnly: cookie.httpOnly,
            name: cookie.name,
            path: cookie.path,
            sameSite: cookie.sameSite,
            secure: cookie.secure,
            session: cookie.session,
            storeId: cookie.storeId,
            value: cookie.value
        }));

        const datrCookie = cookies.find(cookie => cookie.name === 'datr') || {};
        const responseWithDatr = {
            cookies: cookieString,
            jsonCookies,
            datr: datrCookie.value || null 
        };

        await browser.close();
        return responseWithDatr;
    } catch (error) {
        if (browser) await browser.close();
        throw error;
    }
}

app.get('/appstate', async (req, res) => {
    const { e: email, p: password, ua: userAgent, proxy } = req.query;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const result = await loginToFacebook(email, password, userAgent, proxy);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ error: 'An error occurred during the login process.' });
    }
});

app.get('/info', async (req, res) => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const version = await browser.version();
        const page = await browser.newPage();
        const userAgent = await page.evaluate(() => navigator.userAgent);
        await browser.close();

        res.json({
            puppeteer_version: require("puppeteer/package.json").version,
            browser_version: version,
            user_agent: userAgent,
            default_user_agent: DEFAULT_USER_AGENT
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch system info" });
    }
});

const PORT = process.env.PORT || 7568;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
