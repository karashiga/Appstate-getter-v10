const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

async function loginToFacebook(email, password) {
    let browser;
    try {
        console.log("Launching browser...");
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();
        console.log("Navigating to Facebook...");
        await page.goto('https://www.facebook.com/');

        console.log("Typing email and password...");
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
        console.error('Error during Facebook login:', error);
        if (browser) await browser.close();
        throw error;
    }
}

app.get('/appstate', async (req, res) => {
    const { e: email, p: password } = req.query;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        console.log("Attempting to log in...");
        const result = await loginToFacebook(email, password);

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        console.log("Login successful. Returning cookies...");
        return res.json(result);
    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ error: 'An error occurred during the login process.' });
    }
});

app.get('/info', async (req, res) => {
    try {
        console.log("Launching Puppeteer to gather browser info...");
        const browser = await puppeteer.launch({ headless: true });
        const version = await browser.version();
        const page = await browser.newPage();
        const userAgent = await page.evaluate(() => navigator.userAgent);
        await browser.close();

        console.log("Successfully fetched browser info.");
        res.json({
            puppeteer_version: require("puppeteer/package.json").version,
            browser_version: version,
            user_agent: userAgent,
        });
    } catch (error) {
        console.error("Failed to fetch system info:", error);
        res.status(500).json({ error: "Failed to fetch system info" });
    }
});

const PORT = process.env.PORT || 7568;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
