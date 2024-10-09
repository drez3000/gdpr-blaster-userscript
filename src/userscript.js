// ==UserScript==
// @name         GDPR Blaster
// @description  Automatically removes GDPR / Cookie Consent dialogs without accepting or denying them.
// @namespace    http://crisali.de/
// @author       drez3000@protonmail.com
// @license      MIT
// @tag          productivity
// @match        *://*/*
// @grant        none
// @version      0.1.2
// @updateURL    https://raw.githubusercontent.com/drez3000/gdpr-blaster-userscript/main/src/userscript.js
// @downloadURL  https://raw.githubusercontent.com/drez3000/gdpr-blaster-userscript/main/src/userscript.js
// ==/UserScript==

;(() => {
	'use strict'

	const ATTEMPTS = 16
	const PASSES = 3
	const MAX_OVERLAY_REMOVAL_DEPTH = 5
	const MAX_CHECK_DELAY_MS = 200
	const MAX_TRIGGERS = 1

	function all(conditions, item) {
		return conditions.find((f) => !f(item)) === undefined
	}

	function any(conditions, item) {
		return conditions.find((f) => f(item)) !== undefined
	}

	function oncePageLoaded(callback) {
		if (document.readyState !== 'loading') {
			// Document is already ready, call the callback immediately
			callback()
		} else {
			// Document is not ready yet, wait for the DOMContentLoaded event
			document.addEventListener('DOMContentLoaded', callback)
		}
	}

	function flatNodesOf(node, { minDepth = 0, maxDepth = Number.POSITIVE_INFINITY, includeShadowRoot = true } = {}) {
		const nodes = []
		const stack = [{ node, depth: 0 }]
		while (stack.length > 0) {
			const { node: currentNode, depth } = stack.pop()

			if (depth >= minDepth && depth <= maxDepth) {
				nodes.push({ node: currentNode, depth })
			}

			// Add children to the stack with increased depth
			for (let i = currentNode.childNodes.length - 1; i >= 0; i--) {
				stack.push({ node: currentNode.childNodes[i], depth: depth + 1 })
			}
			if (includeShadowRoot && currentNode.shadowRoot) {
				stack.push({ node: currentNode.shadowRoot, depth: depth + 1 })
			}
		}
		return nodes.sort((a, b) => a.depth - b.depth).map((item) => item.node)
	}

	function subtreeMatching(element, conditions = []) {
		conditions = Array.isArray(conditions) ? conditions : [conditions]
		conditions = [(node) => node.constructor.name != 'HTMLDocument', ...conditions]
		return flatNodesOf(element)
			.reverse()
			.filter((node) => all(conditions, node))
	}

	function methodA(node) {
		const banlist = [
			/iubenda/i,
			/cookie-banner/i,
			/cookie-popup/i,
			/cookie-consent/i,
			/gdpr/i,

			/^didomi-popup$/i,
			/^notice-cookie-block$/i,
			/^tc-privacy-wrapper$/i,
			/^cmpbox$/i,
			/^cookie-note$/i,
			/^cookie-law-info-bar$/i,
			/^cf-root$/i,
			/^cookiefirst-root$/i,
			/^CybotCookiebotDialog$/i,
			/^usercentrics-root$/i,
			/^onetrust-consent-sdk$/i,
			/^onetrust-banner-sdk$/i,
			/^ppms_cm_popup_overlay$/i,
			/^consent_blackbar$/i,
			/^truste-consent-track$/i,
			/^consent-bump$/i,
			/^sp_message_container$/i,
			/^sp_message_container_.*$/i,
			/^consentBanner$/i,
			/^cookie-banner-root$/i,
			/^gdpr-banner-container$/i,
			/^as-oil$/i,
			/^iubenda$/i,
			/^iubenda-cs-banner$/i,
			/^gdpr$/i,
			/^cookies$/i,
			/^cookie$/i,
			/^privacy-policy$/i,
			/^privacyPolicy$/i,
			/^tracking$/i,
			/^privacy$/i,
			/^consent$/i,
			/^qc-cmp-ui-container$/i,
			/^qc-cmp-showing$/i,
			/^wt-cli-cookie-bar-container$/i,
			/^wt-cli-cookie-bar$/i,
			/^BorlabsCookie$/i,
			/^osano-cm-window$/i,
			/^js-cookie-consent-banner$/i,
			/^hx_cookie-banner$/i,
		]
		const classes = node.className.split(' ')
		const id = node.id.toLowerCase()
		const haystack = classes.concat(id)
		const conditions = banlist.map((ban) => (hay) => hay.match(ban))
		const matches = undefined !== haystack.find((hay) => any(conditions, hay))
		return matches
	}

	function methodB(node) {
		const confirmationHints = [/\ba(cc|kz)e(p)?t/i, /\bagree/i, /\bconsent\b/i, /\bcontinu\b/i, /\benable\b/i, /\ballow\b/i, /\bok\b/i]
		const denialHints = [
			/\breject\b/i,
			/\brifiuta\b/i,
			/\bdeny\b/i,
			/\bclose\b/i,
			/\boptions\b/i,
			/\bprefer/i,
			/\bsetting/i,
			/\bconfig/i,
			/\bimposta/i,
			/\b(non)?(-)?essen(t|z)ial\b/i,
		]
		const contentHints = [/\bcookie\b/i, /(we|this site) use(s)?/i]

		const clickableElements = subtreeMatching(
			node,
			(node) =>
				node?.tagName?.match(/^(button|a)$/i) ||
				(node?.tagName?.match(/^input$/i) && node?.attributes?.type?.value?.match(/^submit$/i)),
		)

		const acceptConditions = confirmationHints.map((h) => (t) => t.match(h))
		const has1Accept = clickableElements.find((el) => any(acceptConditions, el.innerText))

		const denyConditions = denialHints.map((h) => (t) => t.match(h))
		const has1Deny = clickableElements.find((el) => any(denyConditions, el.innerText))

		const contentConditions = contentHints.map((h) => (t) => t.match(h))
		const hasMatchingContent = any(contentConditions, node.innerText)

		return !!(node && clickableElements.length >= 2 && (has1Accept || has1Deny) && hasMatchingContent)
	}

	const whitelist = ['html', 'body', 'main', 'article']
	const detectionMethods = [methodA, methodB]

	function isNotMain(node) {
		const qs = whitelist.join(', ')
		const found = node.querySelector(qs)
		const tagName = node?.tagName?.toLowerCase() || ''
		return !whitelist.includes(tagName) && !found
	}

	function isNotWhitelisted(node) {
		const tag = node?.tagName?.toLowerCase()
		return !!tag && !whitelist.includes(tag)
	}

	function hasPlausibleSize(node) {
		const va = window.innerHeight * window.innerWidth
		const nr = node?.getBoundingClientRect && node.getBoundingClientRect()
		const na = nr && nr.width * nr.height
		const rat = na && Math.sqrt(na) / Math.sqrt(va)
		return rat > 0.05 && rat < 1.1 && nr.height < window.innerHeight && nr.width >= nr.height
	}

	function isInViewport(node) {
		const style = node?.constructor?.name?.match(/Element$/) && window.getComputedStyle(node)
		const isFixed = !!style && style.position === 'fixed'
		const fromY = !isFixed ? window.scrollY : 0
		const toY = !isFixed ? fromY + window.innerHeight : window.innerHeight
		const bb = node?.getBoundingClientRect && node.getBoundingClientRect()
		return bb && ((bb.top >= fromY && bb.top <= toY) || (bb.bottom >= fromY && bb.bottom <= toY))
	}

	function containsClickableSomething(node) {
		return (
			typeof node?.querySelector === 'function' &&
			(node.querySelector('button') || node.querySelector('a') || node.querySelector('input[type="submit"]'))
		)
	}

	function doesntContainInputFields(node) {
		const inputTypes = [
			'color',
			'date',
			'datetime-local',
			'email',
			'file',
			'image',
			'month',
			'number',
			'password',
			'range',
			'search',
			'submit',
			'tel',
			'text',
			'time',
			'url',
			'week',
		]
		const qs = inputTypes.map((t) => `input[type="${t}"]`).join(', ')
		const found = node.querySelector(qs)
		return !found
	}

	function isOverlay(node) {
		const style = window.getComputedStyle(node)
		const viewport = window.innerHeight * window.innerWidth
		const rect = node && node.getBoundingClientRect()
		const area = node && rect.width * rect.height
		const rat = area / viewport
		return (
			rat >= 0.8 &&
			(style.height === '100%' ||
				style.height === '100vh' ||
				style.position === 'fixed' ||
				style.position === 'absolute' ||
				style.zIndex >= 1000 ||
				style.opacity < 0.99)
		)
	}

	function getGdprDialogs() {
		return subtreeMatching(document, [
			(node) => typeof node?.querySelectorAll === 'function',
			(node) => isNotMain(node),
			(node) => isNotWhitelisted(node),
			(node) => hasPlausibleSize(node),
			(node) => containsClickableSomething(node),
			(node) => doesntContainInputFields(node),
			(node) => isInViewport(node),
			(node) => any(detectionMethods, node),
		]).sort((a, b) => {
			const ar = a.getBoundingClientRect()
			const br = b.getBoundingClientRect()
			const aa = ar.height * ar.width
			const ba = br.height * br.width
			return ba - aa
		})
	}

	function canSeeGdprDialogs() {
		return getGdprDialogs().length > 0
	}

	function closeGdprDialogs(many = 1) {
		return getGdprDialogs()
			.slice(0, many)
			.map((dialog) => {
				console.info('[GDPR BLASTER] Removing dialog:', dialog)
				dialog.remove()
			})
	}

	function restoreScroll() {
		// Many websites disable scrolling when the gdpr dialog is open
		// Since we harshly remove()'d the dialogs, we need to do our best to ensure user can scroll page content

		const elements = [document.body, document.querySelector('html'), document.documentElement, document.scrollingElement].filter(
			(x) => !!x,
		)

		const needles = [/no[-_]?scroll/i, /scroll(ing)?[-_]?disabl/i, /disabl.*scroll/i, /(modal|popup|banner|gdpr|consent)[-_]?open/i]

		for (const element of elements) {
			const classes = [...element.classList]
			for (const cls of classes) {
				for (const needle of needles) {
					if (cls.match(needle)) {
						element.classList.remove(cls)
					}
				}
			}
			element.style.overflow = ''
			element.style.position = ''
		}
	}

	function removeOverlays() {
		return flatNodesOf(document, { maxDepth: MAX_OVERLAY_REMOVAL_DEPTH })
			.filter((node) => {
				return (
					typeof node?.querySelector === 'function' &&
					isNotWhitelisted(node) &&
					isOverlay(node) &&
					isNotMain(node) &&
					doesntContainInputFields(node)
				)
			})
			.map((node) => {
				console.info('[GDPR BLASTER] Removing overlay:', node)
				node.remove && node.remove()
			})
	}

	function enqueue(a = 0, triggered = 0) {
		const ms = Math.max(0, Math.min(10 ** (a - 1), MAX_CHECK_DELAY_MS))
		setTimeout(() => {
			let p = PASSES
			let once = 1
			while (p--) {
				if (canSeeGdprDialogs()) {
					closeGdprDialogs(1)
					triggered += once
					once = 0
				}
				if (triggered && p === PASSES - 1) {
					setTimeout(removeOverlays)
					setTimeout(restoreScroll)
					triggered += once
					once = 0
				}
			}
			if (triggered < MAX_TRIGGERS && a < ATTEMPTS) {
				enqueue(a + 1, triggered)
			} else {
				document.querySelector('html').style.overflow = ''
			}
		}, ms)
	}

	oncePageLoaded(enqueue)
})()
