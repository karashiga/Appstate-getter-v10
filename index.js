const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const axios = require('axios');

const app = express();

async function getBrowserInfo() {
  try {
    console.log('Launching Puppeteer browser...');
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-infobars",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    console.log('Puppeteer browser launched successfully.');

    const version = await browser.version();
    console.log(`Puppeteer found as: ${version}`);

    const page = await browser.newPage();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await browser.close();

    console.log('Successfully deployed Puppeteer.');

    return {
      puppeteer_version: require("puppeteer/package.json").version,
      browser_version: version,
      user_agent: userAgent,
    };
  } catch (error) {
    throw new Error("Failed to fetch system info");
  }
}

app.get("/info", async (req, res) => {
  try {
    const info = await getBrowserInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function loginToFacebook(email, password) {
  try {
    console.log('Launching Puppeteer browser for Facebook login...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-infobars",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    console.log('Puppeteer browser launched for Facebook login.');

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
    await browser.close();

    console.log('Facebook login successful.');

    return { cookies: cookieString, message: "Login successful" };
  } catch (error) {
    console.error("Error during Facebook login:", error);
    return { error: "An error occurred during the login process." };
  }
}

app.get("/appstate", async (req, res) => {
  const { email, password } = req.query;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await loginToFacebook(email, password);
    return res.json(result);
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'An error occurred during the login process.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
