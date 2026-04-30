// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8000',
        trace: 'on-first-retry',
        headless: true,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'python server.py',
        url: 'http://localhost:8000',
        reuseExistingServer: true,
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 15_000,
        env: {
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
        },
    },
});
