const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
let browser;

app.use(express.static(path.join(__dirname, "public")));

async function initializeBrowser() {
    if (!browser) {
        console.log("🔄 Launching Puppeteer...");
        browser = await puppeteer.launch({
            headless: true, // Set to 'true' for headless mode
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
        console.log("✅ Puppeteer is ready and running!");
    }
    return browser;
}

async function getBrowserInfo() {
    if (!browser) return { error: "No active browser instance found." };

    const version = await browser.version();
    const page = await browser.newPage();
    const userAgent = await page.userAgent();
    await page.close();

    return { version, userAgent };
}

async function loginToFacebook(email, password) {
    try {
        console.log("🔄 Processing Facebook login...");
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
            console.log("❌ Login failed: Wrong username or password.");
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

        console.log("✅ Facebook login successful!");
        return { cookies: cookieString, jsonCookies, datr: datrCookie.value || null };
    } catch (error) {
        console.error("❌ Error during Facebook login:", error);
        return { error: "An error occurred during the login process." };
    }
}

app.get("/appstate", async (req, res) => {
    const { e: email, p: password } = req.query;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const result = await loginToFacebook(email, password);
    return res.json(result);
});

app.get("/info", async (req, res) => {
    const info = await getBrowserInfo();
    return res.json(info);
});

const PORT = process.env.PORT || 7568;
app.listen(PORT, async () => {
    await initializeBrowser(); // Ensure Puppeteer is running at startup
    console.log(`🚀 Express server is running on http://localhost:${PORT}`);
});
