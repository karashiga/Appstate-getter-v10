const express = require("express");
const puppeteer = require("puppeteer");
const { exec } = require("child_process");
const { promisify } = require("util");
const freeport = require("freeport");
const ProxyChain = require("proxy-chain");
const path = require("path");
const axios = require("axios");

const app = express();
let browser;

app.use(express.static(path.join(__dirname, "public")));

async function initializeBrowser(proxyPort) {
    return puppeteer.launch({
        headless: false,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-dev-shm-usage",
            "--ignore-certificate-errors",
            `--proxy-server=127.0.0.1:${proxyPort}`
        ]
    });
}

async function findFreePort() {
    return new Promise((resolve, reject) => {
        freeport((err, port) => {
            if (err) reject(err);
            else resolve(port);
        });
    });
}

async function getBrowserInfo() {
    if (!browser) return { error: "No active browser instance found." };
    
    const version = await browser.version();
    const page = await browser.newPage();
    const userAgent = await page.userAgent();
    await page.close();

    return { version, userAgent };
}

async function loginToFacebook(email, password, proxyPort) {
    try {
        browser = await initializeBrowser(proxyPort);
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
            await browser.close();
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
            value: cookie.value
        }));

        const datrCookie = cookies.find(cookie => cookie.name === "datr") || {};

        await browser.close();
        return { cookies: cookieString, jsonCookies, datr: datrCookie.value || null };
    } catch (error) {
        console.error("Error during Facebook login:", error);
        if (browser) await browser.close();
        throw error;
    }
}

async function startProxy() {
    const proxyPort = await findFreePort();
    const proxyServer = new ProxyChain.Server({ port: proxyPort });

    return new Promise((resolve, reject) => {
        proxyServer.listen((err) => {
            if (err) reject(err);
            else {
                console.log(`Proxy server started on port ${proxyPort}`);
                resolve({ proxyPort, proxyServer });
            }
        });
    });
}

async function startProxyAndServer() {
    try {
        const { proxyPort } = await startProxy();

        app.get("/appstate", async (req, res) => {
            const { e: email, p: password } = req.query;
            if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

            try {
                const result = await loginToFacebook(email, password, proxyPort);
                return res.json(result);
            } catch (error) {
                console.error("Error during login:", error);
                return res.status(500).json({ error: "An error occurred during the login process." });
            }
        });

        app.get("/info", async (req, res) => {
            const info = await getBrowserInfo();
            return res.json(info);
        });

        const PORT = process.env.PORT || 7568;
        app.listen(PORT, () => {
            console.log(`Express server is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Error initializing the proxy and server:", err);
    }
}

startProxyAndServer();
