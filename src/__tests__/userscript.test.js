import path from 'node:path'
import puppeteer from 'puppeteer'

const testWebsites = [
	// These ones worked with a manual test, but are hard to test automatically for a reason or another, see each entry's detail.
	// - { url: 'https://www.reddit.com/', selectors: ['reddit-cookie-banner'] }, // puppeteer tab crashes, manual test passed
	// - { url: 'https://open.spotify.com/', selectors: ['#onetrust-banner-sdk'] }, // puppeteer tab crashes, manual test passed
	// - { url: 'https://aliexpress.com/', selectors: ['#gdpr-new-container'] }, // uses two divs with same id: automated check fails, manual test passed
	// - { url: 'https://www.google.com', selectors: ['div[role="dialog"]'] }, // TODO

	// This is a case we actually need to figure out how to handle. Uses an iframe.
	// - { url: 'https://www.bild.de/', selectors: ['.message-overlay'] },

	{ url: 'https://www.nytimes.com/', selectors: ['#fides-banner'] },
	{ url: 'https://www.subito.it/', selectors: ['#didomi-popup'] },
	{ url: 'https://www.rainews.it/', selectors: ['#as-oil-first-layer'] },
	{ url: 'https://www.lastampa.it/', selectors: ['#iubenda-cs-banner'] },
	{ url: 'https://www.repubblica.it/', selectors: ['#iubenda-cs-banner'] },
	{ url: 'https://www.meteo.it/', selectors: ['.rti-privacy-content'] },
	{ url: 'https://www.rai.it/', selectors: ['#as-oil', '#as-oil-first-layer'] },
	{ url: 'https://www.ubisoft.com/', selectors: ['#privacy_modal'] },
	{ url: 'https://www.iubenda.com/en/', selectors: ['#iubenda-cs-banner'] },
	{ url: 'https://www.michelin.com/', selectors: ['#didomi-popup'] },
	{ url: 'https://www.pirelli.com/', selectors: ['#cookie-bar'] },
]

async function wait(ms) {
	return new Promise((res) => setTimeout(res, ms))
}

describe('userscript.js', () => {
	let browser
	beforeAll(async () => {
		// chromium headless still behaves differently
		browser = await puppeteer.launch({ headless: false })
	})
	afterAll(async () => browser && (await browser.close()))
	const makeTest = (website) => async () => {
		let err = null
		let page = undefined
		let hadGdprModalsBefore = undefined
		let hadGdprModalsAfter = undefined
		let scrollYBefore = undefined
		let scrollYAfter = undefined
		try {
			// Page setup
			page = await browser.newPage()
			await page.setViewport({ width: 1920, height: 1080 })
			await page.goto(website.url)
			await Promise.race([page.waitForNavigation({ waitUntil: 'networkidle2' }), wait(1000)])
			const qs = website.selectors.join(', ')
			try {
				await page.waitForSelector(qs, { timeout: 3000 })
			} catch (_) {
				/* handled by test expectations below instead */
			}

			// Ensure gdpr banner gets obliterated
			hadGdprModalsBefore = await page.evaluate((qs) => document.querySelectorAll(qs).length > 0, qs)
			await page.addScriptTag({ path: path.resolve(__dirname, '../userscript.js') })
			hadGdprModalsAfter = await page.evaluate((qs) => document.querySelectorAll(qs).length > 0, qs)

			// Ensure scroll works (if content height > window height)
			const { windowHeight, contentHeight } = await page.evaluate(() => {
				const body = document.body
				const html = document.documentElement
				const contentHeight = Math.max(
					body.scrollHeight,
					body.offsetHeight,
					html.clientHeight,
					html.scrollHeight,
					html.offsetHeight,
				)
				const windowHeight = window.innerHeight
				return { contentHeight, windowHeight }
			})
			if (windowHeight >= contentHeight) {
				scrollYBefore = 0
				scrollYAfter = 1
			} else {
				scrollYBefore = await page.evaluate(() => window.scrollY)
				await page.evaluate(() => window.scrollBy(0, 1))
				scrollYAfter = await page.evaluate(() => window.scrollY)
			}
		} catch (e) {
			err = e
		} finally {
			if (page?.close) {
				await page.close()
			}
		}
		expect(err).toBe(null)
		expect(hadGdprModalsBefore).toBe(true)
		expect(hadGdprModalsAfter).toBe(false)
		expect(scrollYAfter).toBeGreaterThan(scrollYBefore)
	}
	for (const website of testWebsites) {
		const { hostname: domain } = new URL(website.url)
		it(`should blast ${domain} banner`, makeTest(website))
	}
})
