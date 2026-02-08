const https = require('https');
const { URL } = require('url');
const { parse: parseCookie, serialize: serializeCookie } = require('cookie');
delete process.env.SSLKEYLOGFILE;

// 锁状态，用于控制同一时间只能发送一条消息
let isSending = false;
let pendingRequests = [];

/**
 * 发送洛谷私信的函数
 * @param {string} uid - 用户ID
 * @param {string} cookieValue - Cookie值
 * @param {number} targetUser - 目标用户ID
 * @param {string} message - 要发送的消息内容
 */
function lgsndmsg(uid, cookieValue, targetUser, message) {
	// 将请求加入队列
	return new Promise((resolve) => {
		const requestData = { uid, cookieValue, targetUser, message, resolve };
		pendingRequests.push(requestData);
		processNextRequest();
		//如果这里判断 !isSending 有可能导致双方都获取不到 isSending，然后就逻辑死锁了
		//为什么说是逻辑死锁呢？因为再来一个请求就恢复正常了
	});
}

/**
 * 处理队列中的下一个请求
 */
function processNextRequest() {
	if (pendingRequests.length === 0 || isSending) return;
	const request = pendingRequests.shift();
	isSending = true;
	console.log('Starting to send message...');
	console.log(`   Target user: ${request.targetUser}`);
	console.log(`   Message length: ${request.message ? request.message.length : 0} characters`);
	_sendMessageInternal(request.uid, request.cookieValue, request.targetUser, request.message)
		.then((result) => {
			isSending = false;
			request.resolve(result);
			setTimeout(() => { processNextRequest(); }, 1000);
		})
		.catch((error) => {
			isSending = false;
			request.resolve({ error: true, message: error.message });
			setTimeout(() => { processNextRequest(); }, 1000);
		});
}

/**
 * 实际的发送消息函数（内部使用）
 */
function _sendMessageInternal(uid, cookieValue, targetUser, message) {
	return new Promise((resolve) => {
		const session = {
			cookies: {},
			jar: {},
			defaultHeaders: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
				'Accept-Language': 'zh-CN,zh;q=0.9',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
			}
		};
		session.cookies['__client_id'] = cookieValue;
		session.cookies['_uid'] = uid;
		console.log('Accessing root page to acquire session info.');
		function makeRequest(options, data = null, followRedirect = true, maxRedirects = 5) {
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
									console.log(`   Redirecting (${redirectCount + 1}/${maxRedirects}) to: ${location}`);
									const redirectUrl = location.startsWith('http') ? location :
										`${urlObj.protocol}//${urlObj.host}${location.startsWith('/') ? '' : '/'}${location}`;
									makeRequestInternal(redirectUrl, redirectCount + 1);
									return;
								}
							}
							resolveRequest({
								statusCode: res.statusCode,
								headers: res.headers,
								data: responseData,
								redirectCount: redirectCount
							});
						});
					});
					req.on('error', (err) => {
						resolveRequest({
							error: true,
							message: `Request error: ${err.message}`,
							statusCode: 0
						});
					});
					req.setTimeout(3000, () => {
						req.destroy();
						resolveRequest({
							error: true,
							message: 'Request time out',
							statusCode: 0
						});
					});
					if (data && reqOptions.method !== 'GET') req.write(data);
					req.end();
				};
				makeRequestInternal(options.url);
			});
		}
		makeRequest({
			url: 'https://www.luogu.com.cn/',
			method: 'GET',
			headers: {
				...session.defaultHeaders,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
			}
		}).then(homeResponse => {
			if (homeResponse.error) {
				console.error(`   Error: ${homeResponse.message}`);
				resolve({ success: false, error: homeResponse.message });
				return { stop: true };
			}
			console.log(`   Root page status code: ${homeResponse.statusCode}`);
			if (homeResponse.data.includes('登录') || homeResponse.data.includes('Sign in')) {
				console.error('   Error: Cookies may be invalid or expired. Please check your cookies.');
				resolve({ success: false, error: 'Error: Cookies may be invalid or expired. Please check your cookies.' });
				return { stop: true };
			}
			console.log(`   Session cookie acquired.`);
			console.log('Accessing chat page');
			return makeRequest({
				url: 'https://www.luogu.com.cn/chat',
				method: 'GET',
				headers: {
					...session.defaultHeaders,
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
					'Cache-Control': 'max-age=0',
					'Priority': 'u=0, i',
					'Sec-CH-UA': '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"',
					'Sec-CH-UA-Mobile': '?0',
					'Sec-CH-UA-Platform': '"Windows"',
					'Sec-Fetch-Dest': 'document',
					'Sec-Fetch-Mode': 'navigate',
					'Sec-Fetch-Site': 'same-origin',
					'Sec-Fetch-User': '?1',
					'Upgrade-Insecure-Requests': '1',
					'Referer': 'https://www.luogu.com.cn/'
				}
			});
		}).then(chatResponse => {
			if (chatResponse && chatResponse.stop) return { stop: true };
			if (chatResponse.error) {
				console.error(`   Error: ${chatResponse.message}`);
				resolve({ success: false, error: chatResponse.message });
				return { stop: true };
			}
			console.log(`   Chat page status code: ${chatResponse.statusCode}`);
			if (chatResponse.statusCode !== 200) {
				if (chatResponse.redirectCount > 0) {
					if (chatResponse.data.includes('登录') || chatResponse.data.includes('auth/login')) {
						console.error('   Error: Authentication failed - redirected to login page');
						resolve({ success: false, error: 'Error: Authentication failed - redirected to login page' });
						return { stop: true };
					}
				}
				console.error(`   Error: Failed to access chat page. Status code: ${chatResponse.statusCode}`);
				resolve({ success: false, error: `Error: Failed to access chat page. Status code: ${chatResponse.statusCode}` });
				return { stop: true };
			}
			if (chatResponse.data.includes('登录') || chatResponse.data.includes('Sign in')) {
				console.error('   Error: Not logged in or session expired');
				resolve({ success: false, error: 'Error: Not logged in or session expired' });
				return { stop: true };
			}
			const csrfTokenMatch = chatResponse.data.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
			let csrfToken = '';
			if (csrfTokenMatch && csrfTokenMatch[1]) {
				csrfToken = csrfTokenMatch[1];
				console.log(`   CSRF Token acquired: ${csrfToken.substring(0, 30)}...`);
			}
			else {
				const csrfPattern = /window\._feInstance\.config\.csrfToken\s*=\s*["']([^"']+)["']/;
				const csrfMatch2 = chatResponse.data.match(csrfPattern);
				if (csrfMatch2 && csrfMatch2[1]) {
					csrfToken = csrfMatch2[1];
					console.log(`   CSRF Token acquired (from JS): ${csrfToken.substring(0, 30)}...`);
				}
				else {
					console.error('   Error: Failed to extract CSRF token');
					resolve({ success: false, error: 'Error: Failed to extract CSRF token' });
					return { stop: true };
				}
			}
			console.log('Sending Message');
			const requestData = JSON.stringify({
				user: targetUser,
				content: message || "Automatically generated by Node.js script. All junk data will be thrown to you. Have a pleasant cooperation!"
			});
			return new Promise((innerResolve) => {
				setTimeout(() => { innerResolve({ csrfToken, requestData, stop: false }); }, 1500);
			});
		}).then((result) => {
			if (!result || result.stop) return { stop: true };
			const { csrfToken, requestData } = result;
			return makeRequest({
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
					'Referer': 'https://www.luogu.com.cn/chat'
				}
			}, requestData, false);
		}).then(response => {
			if (response && response.stop) return;
			if (response.error) {
				console.error(`   Error: ${response.message}`);
				resolve({ success: false, error: response.message });
				return;
			}
			console.log(`   Chat sending status code: ${response.statusCode}`);
			if (response.statusCode === 200) {
				console.log('   Success: Message sent successfully!');
				resolve({ success: true, statusCode: response.statusCode });
			}
			else if (response.statusCode === 429) {
				console.error('   Error: Rate limited.');
				resolve({ success: false, error: 'Error: Rate limited.', statusCode: response.statusCode });
			}
			else if (response.statusCode === 401 || response.statusCode === 403) {
				console.error('   Error: Authentication failed. Check your cookies.');
				resolve({ success: false, error: 'Error: Authentication failed. Check your cookies.', statusCode: response.statusCode });
			}
			else {
				console.error(`   Error: Failed with status code: ${response.statusCode}`);
				try {
					const errorData = JSON.parse(response.data);
					console.error(`   Error details: ${JSON.stringify(errorData)}`);
					resolve({ success: false, error: errorData.error || 'Failed', statusCode: response.statusCode, details: errorData });
				}
				catch (e) {
					console.error(`   Response: ${response.data.substring(0, 200)}`);
					resolve({ success: false, error: `Failed with status code: ${response.statusCode}`, statusCode: response.statusCode });
				}
			}
		}).catch(() => {
			resolve({ success: false, error: 'Internal error' });
		});
	});
}

module.exports = { lgsndmsg };