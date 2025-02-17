const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
let browser;

app.use(express.static(path.join(__dirname, "public")));

async function initializeBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-infobars",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.102 Safari/537.36"
            ]
        });
    }
    return browser;
}

async function loginToFacebook(email, password) {
    try {
        browser = await initializeBrowser();
        const page = await browser.newPage();
        await page.goto("https://www.facebook.com/");

        await page.type("#email", email);
        await page.type("#pass", password);

        await Promise.all([
            page.click('[name="login"]'),
            page.waitForNavigation({ waitUntil: "networkidle0" }),
        ]);

        const cookies = await page.cookies();
        const loginFailed = await page.$('input[name="email"]');
        if (loginFailed) {
            return { error: "Wrong username or password. Please try again." };
        }

        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
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

        const datrCookie = cookies.find(cookie => cookie.name === "datr") || {};

        return { cookies: cookieString, jsonCookies, datr: datrCookie.value || null };
    } catch (error) {
        return { error: "An error occurred during the login process." };
    }
}

app.get("/info", async (req, res) => {
    try {
        const browser = await puppeteer.launch({ headless: "new" });
        const version = await browser.version();
        const page = await browser.newPage();
        const userAgent = await page.evaluate(() => navigator.userAgent);
        await browser.close();

        res.json({
            puppeteer_version: require("puppeteer/package.json").version,
            browser_version: version,
            user_agent: userAgent,
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch system info" });
    }
});

app.get("/appstate", async (req, res) => {
    const { e: email, p: password } = req.query;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const result = await loginToFacebook(email, password);
    return res.json(result);
});

const PORT = process.env.PORT || 7568;
app.listen(PORT, async () => {
    await initializeBrowser();
    console.log(`Express server is running on http://localhost:${PORT}`);
});
