const https = require('https');
const { URL } = require('url');
const { parse: parseCookie } = require('cookie');
delete process.env.SSLKEYLOGFILE;
let isProcessing = false;
let pendingRequests = [];

/**
 * send an message to target user
 * @param {any} uid
 * @param {any} cookieValue
 * @param {any} targetUser
 * @param {any} message
 * @returns
 */
function lgsndmsg(uid, cookieValue, targetUser, message) {
	return new Promise((resolve) => {
		pendingRequests.push({ type: 'send', uid, cookieValue, targetUser, message, resolve });
		processNextRequest();
	});
}

/**
 * gets the most recent message from target user
 * @param {any} uid
 * @param {any} cookieValue
 * @param {any} targetUser
 * @returns
 */
function lggetmsg(uid, cookieValue, targetUser) {
	return new Promise((resolve) => {
		pendingRequests.push({ type: 'get', uid, cookieValue, targetUser, resolve });
		processNextRequest();
	});
}

function processNextRequest() {
	if (pendingRequests.length === 0 || isProcessing) return;
	const request = pendingRequests.shift();
	isProcessing = true;
	const handler = request.type === 'send' ? _sendMessageInternal : _getMessageInternal;
	handler(request.uid, request.cookieValue, request.targetUser, request.message)
		.then((result) => {
			isProcessing = false;
			request.resolve(result);
			setTimeout(processNextRequest, 3000);
		})
		.catch((error) => {
			isProcessing = false;
			request.resolve({ error: true, message: error.message });
			setTimeout(processNextRequest, 3000);
		});
}

function _createSession(uid, cookieValue) {
	return {
		cookies: { __client_id: cookieValue, _uid: uid },
		defaultHeaders: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
			'Accept-Language': 'zh-CN,zh;q=0.9',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
		}
	};
}

function _makeRequest(session, options, data = null, followRedirect = true, maxRedirects = 5) {
	return new Promise((resolveRequest) => {
		const makeRequestInternal = (url, redirectCount = 0) => {
			const urlObj = new URL(url);
			const reqOptions = {
				hostname: urlObj.hostname,
				port: urlObj.port || 443,
				path: urlObj.pathname + urlObj.search,
				method: options.method || 'GET',
				headers: options.headers || {}
			};
			const cookieStr = Object.entries(session.cookies).map(([key, value]) => `${key}=${value}`).join('; ');
			if (cookieStr) reqOptions.headers.Cookie = cookieStr;
			const req = https.request(reqOptions, (res) => {
				let responseData = '';
				res.on('data', (chunk) => { responseData += chunk; });
				if (res.headers['set-cookie']) {
					const cookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']];
					cookies.forEach(cookieStr => {
						const cookie = parseCookie(cookieStr.split(';')[0]);
						Object.assign(session.cookies, cookie);
					});
				}
				res.on('end', () => {
					if (followRedirect && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308)) {
						const location = res.headers.location;
						if (location && redirectCount < maxRedirects) {
							const redirectUrl = location.startsWith('http') ? location : `${urlObj.protocol}//${urlObj.host}${location.startsWith('/') ? '' : '/'}${location}`;
							makeRequestInternal(redirectUrl, redirectCount + 1);
							return;
						}
					}
					resolveRequest({ statusCode: res.statusCode, headers: res.headers, data: responseData, redirectCount });
				});
			});
			req.on('error', (err) => {
				resolveRequest({ error: true, message: `Request error: ${err.message}`, statusCode: 0 });
			});
			req.setTimeout(3000, () => {
				req.destroy();
				resolveRequest({ error: true, message: 'Request time out', statusCode: 0 });
			});
			if (data && reqOptions.method !== 'GET') req.write(data);
			req.end();
		};
		makeRequestInternal(options.url);
	});
}

function _extractC3VK(responseData) {
	let c3vkValue = null;
	const c3vkMatch = responseData.match(/document\.cookie\s*=\s*["']C3VK=([^;"']+)/);
	if (c3vkMatch && c3vkMatch[1]) c3vkValue = c3vkMatch[1];
	else {
		const altMatch = responseData.match(/C3VK=([^;]+)/);
		if (altMatch && altMatch[1]) c3vkValue = altMatch[1];
	}
	return c3vkValue;
}

function _checkLoginStatus(responseData) {
	return responseData.includes('登录') || responseData.includes('Sign in');
}

async function _sendMessageInternal(uid, cookieValue, targetUser, message) {
	const session = _createSession(uid, cookieValue);
	console.log('Starting to send message...');
	console.log(`   Target user: ${targetUser}`);
	console.log(`   Message length: ${message ? message.length : 0} characters`);
	console.log('Accessing root page to acquire C3VK cookie.');
	const firstResponse = await _makeRequest(session, {
		url: 'https://www.luogu.com.cn/',
		method: 'GET',
		headers: { ...session.defaultHeaders }
	});
	if (firstResponse.error) {
		console.error(`   Error: ${firstResponse.message}`);
		return { success: false, error: firstResponse.message };
	}
	console.log(`   First request status code: ${firstResponse.statusCode}`);
	const c3vkValue = _extractC3VK(firstResponse.data);
	if (c3vkValue) {
		console.log(`   Extracted C3VK value`);
		session.cookies['C3VK'] = c3vkValue;
	}
	else {
		console.error('   Error: Failed to extract C3VK from first response');
		if (_checkLoginStatus(firstResponse.data)) {
			console.error('   Error: Cookies may be invalid or expired. Please check your cookies.');
			return { success: false, error: 'Error: Cookies may be invalid or expired. Please check your cookies.' };
		}
		console.log('   Warning: Continuing without C3VK cookie');
	}
	console.log('Making second request to get CSRF token with C3VK cookie...');
	const secondResponse = await _makeRequest(session, {
		url: 'https://www.luogu.com.cn/',
		method: 'GET',
		headers: {
			...session.defaultHeaders,
			'Cache-Control': 'max-age=0',
			'Referer': 'https://www.luogu.com.cn/'
		}
	});
	if (secondResponse.error) {
		console.error(`   Error: ${secondResponse.message}`);
		return { success: false, error: secondResponse.message };
	}
	console.log(`   Second request status code: ${secondResponse.statusCode}`);
	if (_checkLoginStatus(secondResponse.data)) {
		console.error('   Error: Not logged in or session expired');
		return { success: false, error: 'Error: Not logged in or session expired' };
	}
	const csrfTokenMatch = secondResponse.data.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
	let csrfToken = '';
	if (csrfTokenMatch && csrfTokenMatch[1]) {
		csrfToken = csrfTokenMatch[1];
		console.log(`   CSRF Token acquired: ${csrfToken.substring(0, 30)}...`);
	}
	else {
		console.error('   Error: Failed to extract CSRF token from second response');
		return { success: false, error: 'Error: Failed to extract CSRF token' };
	}
	console.log(`   Session established successfully.`);
	const requestData = JSON.stringify({
		user: targetUser,
		content: message || "Automatically generated by Node.js script. All junk data will be thrown to you. Have a pleasant cooperation!"
	});
	console.log('Sending Message...');
	const response = await _makeRequest(session, {
		url: 'https://www.luogu.com.cn/api/chat/new',
		method: 'POST',
		headers: {
			...session.defaultHeaders,
			'Accept': 'application/json, text/plain, */*',
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(requestData),
			'Priority': 'u=1, i',
			'Sec-CH-UA': '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"',
			'Sec-CH-UA-Mobile': '?0',
			'Sec-CH-UA-Platform': '"Windows"',
			'Sec-Fetch-Dest': 'empty',
			'Sec-Fetch-Mode': 'cors',
			'Sec-Fetch-Site': 'same-origin',
			'X-CSRF-Token': csrfToken,
			'X-Requested-With': 'XMLHttpRequest',
			'Origin': 'https://www.luogu.com.cn',
			'Referer': 'https://www.luogu.com.cn/'
		}
	}, requestData, false);
	if (response.error) {
		console.error(`   Error: ${response.message}`);
		return { success: false, error: response.message };
	}
	console.log(`   Chat sending status code: ${response.statusCode}`);
	if (response.statusCode === 200) {
		console.log('   Success: Message sent successfully!');
		return { success: true, statusCode: response.statusCode };
	}
	else {
		console.error(`   Error: Failed with status code: ${response.statusCode}`);
		try {
			const errorData = JSON.parse(response.data);
			console.error(`   Error details: ${JSON.stringify(errorData)}`);
			return { success: false, error: errorData.error || 'Failed', statusCode: response.statusCode, details: errorData };
		}
		catch (e) {
			console.error(`   Response: ${response.data.substring(0, 200)}`);
			return { success: false, error: `Failed with status code: ${response.statusCode}`, statusCode: response.statusCode };
		}
	}
}

async function _getMessageInternal(uid, cookieValue, targetUser) {
	const session = _createSession(uid, cookieValue);
	console.log('Starting to fetch recent messages...');
	console.log(`   Target user: ${targetUser}`);
	console.log('Accessing root page to acquire C3VK cookie...');
	const firstResponse = await _makeRequest(session, {
		url: 'https://www.luogu.com.cn/',
		method: 'GET',
		headers: { ...session.defaultHeaders }
	});
	if (firstResponse.error) {
		console.error(`   Error: ${firstResponse.message}`);
		return { success: false, error: firstResponse.message };
	}
	console.log(`   First request status code: ${firstResponse.statusCode}`);
	const c3vkValue = _extractC3VK(firstResponse.data);
	if (c3vkValue) {
		console.log(`   Extracted C3VK value`);
		session.cookies['C3VK'] = c3vkValue;
	}
	else {
		if (_checkLoginStatus(firstResponse.data)) {
			console.error('   Error: Cookies may be invalid or expired. Please check your cookies.');
			return { success: false, error: 'Error: Cookies may be invalid or expired. Please check your cookies.' };
		}
		console.log('   Warning: Continuing without C3VK cookie');
	}
	console.log(`Fetching chat records with user ${targetUser}...`);
	const response = await _makeRequest(session, {
		url: `https://www.luogu.com.cn/api/chat/record?user=${targetUser}`,
		method: 'GET',
		headers: {
			...session.defaultHeaders,
			'Referer': 'https://www.luogu.com.cn/chat'
		}
	}, null, false);
	if (response.error) {
		console.error(`   Error: ${response.message}`);
		return { success: false, error: response.message };
	}
	console.log(`   Chat records status code: ${response.statusCode}`);
	try {
		const data = JSON.parse(response.data);
		if (response.statusCode === 200) {
			if (data.messages && data.messages.result && data.messages.result.length > 0) {
				const latestMessage = data.messages.result[data.messages.result.length - 1];
				console.log(`   Success: Found ${data.messages.result.length} message(s). Latest message ID: ${latestMessage.id}`);
				return {
					success: true,
					statusCode: response.statusCode,
					message: latestMessage,
					totalCount: data.count
				};
			}
			else {
				console.log('   Success: No messages found with this user.');
				return {
					success: true,
					statusCode: response.statusCode,
					message: null,
					totalCount: 0
				};
			}
		}
		else {
			console.error(`   Error: Failed with status code: ${response.statusCode}`);
			if (data.error) {
				console.error(`   Error details: ${JSON.stringify(data.error)}`);
				return {
					success: false,
					error: data.error || 'Failed',
					statusCode: response.statusCode,
					details: data
				};
			}
			else {
				console.error(`   Response: ${response.data.substring(0, 200)}`);
				return {
					success: false,
					error: `Failed with status code: ${response.statusCode}`,
					statusCode: response.statusCode
				};
			}
		}
	}
	catch (e) {
		console.error(`   Error parsing response: ${e.message}`);
		return {
			success: false,
			error: 'Failed to parse response',
			details: e.message
		};
	}
}

module.exports = { lgsndmsg, lggetmsg };