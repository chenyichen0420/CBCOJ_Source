const https = require('https');
const { URL } = require('url');
const { parse: parseCookie } = require('cookie');
async function lgsndmsg(uid, cookieValue, targetUser, message) {
	return _sendMessageInternal(uid, cookieValue, targetUser, message);
}
async function lggetmsg(uid, cookieValue, targetUser) {
	return _getMessageInternal(uid, cookieValue, targetUser);
}
function _createSession(uid, cookieValue) {
	return {
		cookies: {
			__client_id: cookieValue,
			_uid: uid
		},
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
				res.on('data', (chunk) => {
					responseData += chunk;
				});
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
					resolveRequest({
						statusCode: res.statusCode,
						headers: res.headers,
						data: responseData,
						redirectCount
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
	console.error('Starting to send message...');
	console.error(`   Target user: ${targetUser}`);
	console.error(`   Message length: ${message ? message.length : 0} characters`);
	// 第一步：获取 C3VK
	console.error('Accessing root page to acquire C3VK cookie.');
	const firstResponse = await _makeRequest(session, {
		url: 'https://www.luogu.com.cn/',
		method: 'GET',
		headers: {
			...session.defaultHeaders
		}
	});
	if (firstResponse.error) {
		console.error(`   Error: ${firstResponse.message}`);
		return {
			success: false,
			error: firstResponse.message
		};
	}
	console.error(`   First request status code: ${firstResponse.statusCode}`);
	const c3vkValue = _extractC3VK(firstResponse.data);
	if (c3vkValue) {
		console.error(`   Extracted C3VK value`);
		session.cookies['C3VK'] = c3vkValue;
	}
	else {
		if (_checkLoginStatus(firstResponse.data)) {
			console.error('   Error: Cookies may be invalid or expired. Please check your cookies.');
			return {
				success: false,
				error: 'Error: Cookies may be invalid or expired. Please check your cookies.'
			};
		}
		console.error('   Warning: Continuing without C3VK cookie');
	}
	// 第二步：获取 CSRF token
	console.error('Making second request to get CSRF token with C3VK cookie...');
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
		return {
			success: false,
			error: secondResponse.message
		};
	}
	console.error(`   Second request status code: ${secondResponse.statusCode}`);
	if (_checkLoginStatus(secondResponse.data)) {
		console.error('   Error: Not logged in or session expired');
		return {
			success: false,
			error: 'Error: Not logged in or session expired'
		};
	}
	const csrfTokenMatch = secondResponse.data.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
	let csrfToken = '';
	if (csrfTokenMatch && csrfTokenMatch[1]) {
		csrfToken = csrfTokenMatch[1];
		console.error(`   CSRF Token acquired: ${csrfToken.substring(0, 30)}...`);
	}
	else {
		console.error('   Error: Failed to extract CSRF token from second response');
		return {
			success: false,
			error: 'Error: Failed to extract CSRF token'
		};
	}
	console.error(`   Session established successfully.`);
	const requestData = JSON.stringify({
		user: targetUser,
		content: message || "Automatically generated by Node.js script. All junk data will be thrown to you. Have a pleasant cooperation!"
	});
	console.error('Sending Message...');
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
		return {
			success: false,
			error: response.message
		};
	}
	console.error(`   Chat sending status code: ${response.statusCode}`);
	if (response.statusCode === 200) {
		console.error('   Success: Message sent successfully!');
		return {
			success: true,
			statusCode: response.statusCode
		};
	}
	else {
		console.error(`   Error: Failed with status code: ${response.statusCode}`);
		try {
			const errorData = JSON.parse(response.data);
			console.error(`   Error details: ${JSON.stringify(errorData)}`);
			return {
				success: false,
				error: errorData.error || 'Failed',
				statusCode: response.statusCode,
				details: errorData
			};
		} catch (e) {
			console.error(`   Response: ${response.data.substring(0, 200)}`);
			return {
				success: false,
				error: `Failed with status code: ${response.statusCode}`,
				statusCode: response.statusCode
			};
		}
	}
}
async function _getMessageInternal(uid, cookieValue, targetUser) {
	const session = _createSession(uid, cookieValue);
	console.error('Starting to fetch recent messages...');
	console.error(`   Target user: ${targetUser}`);
	// 第一步：获取 C3VK
	console.error('Accessing root page to acquire C3VK cookie...');
	const firstResponse = await _makeRequest(session, {
		url: 'https://www.luogu.com.cn/',
		method: 'GET',
		headers: {
			...session.defaultHeaders
		}
	});
	if (firstResponse.error) {
		console.error(`   Error: ${firstResponse.message}`);
		return {
			success: false,
			error: firstResponse.message
		};
	}
	console.error(`   First request status code: ${firstResponse.statusCode}`);
	const c3vkValue = _extractC3VK(firstResponse.data);
	if (c3vkValue) {
		console.error(`   Extracted C3VK value`);
		session.cookies['C3VK'] = c3vkValue;
	} else {
		if (_checkLoginStatus(firstResponse.data)) {
			console.error('   Error: Cookies may be invalid or expired. Please check your cookies.');
			return {
				success: false,
				error: 'Error: Cookies may be invalid or expired. Please check your cookies.'
			};
		}
		console.error('   Warning: Continuing without C3VK cookie');
	}
	// 第二步：获取聊天记录
	console.error(`Fetching chat records with user ${targetUser}...`);
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
		return {
			success: false,
			error: response.message
		};
	}
	console.error(`   Chat records status code: ${response.statusCode}`);
	try {
		const data = JSON.parse(response.data);
		if (response.statusCode === 200) {
			if (data.messages && data.messages.result && data.messages.result.length > 0) {
				const latestMessage = data.messages.result[data.messages.result.length - 1];
				console.error(`   Success: Found ${data.messages.result.length} message(s). Latest message ID: ${latestMessage.id}`);
				return {
					success: true,
					statusCode: response.statusCode,
					message: latestMessage,
					totalCount: data.count
				};
			} else {
				console.error('   Success: No messages found with this user.');
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
			} else {
				console.error(`   Response: ${response.data.substring(0, 200)}`);
				return {
					success: false,
					error: `Failed with status code: ${response.statusCode}`,
					statusCode: response.statusCode
				};
			}
		}
	} catch (e) {
		console.error(`   Error parsing response: ${e.message}`);
		return {
			success: false,
			error: 'Failed to parse response',
			details: e.message
		};
	}
}
// ---------- 命令行入口 ----------
async function main() {
	const args = process.argv.slice(2); // 第一个是脚本路径，从第二个开始是用户参数
	if (args.length != 5) {
		console.error('用法:');
		console.error('  lgmsg send <uid> <cookie> <targetUser> <message>');
		console.error('  lgmsg get  <uid> <cookie> <targetUser> <expectedMessage>');
		console.error('注意: 消息内容若包含空格请用引号括起');
		console.log("Will exit 1");
		process.exit(1);
	}
	const command = args[0].toLowerCase();
	if (command !== 'send' && command !== 'get') {
		console.error('错误: 第一个参数必须是 send 或 get');
		console.log("Will exit 1");
		process.exit(1);
	}
	const uid = args[1];
	const cookie = args[2];
	const targetUser = args[3];
	let result;
	if (command === 'send') {
		const message = args.slice(4).join(' ');
		result = await lgsndmsg(uid, cookie, targetUser, message);
		console.log(JSON.stringify(result, null, 2));
		console.log(`Will exit ${result.success ? 0 : 1}`);
		process.exit(result.success ? 0 : 1);
	}
	else {
		const expectedMessage = args.slice(4).join(' ');
		result = await lggetmsg(uid, cookie, targetUser);
		console.log(JSON.stringify(result, null, 2));
		const isMatch = result.success && result.message && result.message.content === expectedMessage;
		console.log(`Will exit ${isMatch ? 0 : 1}`);
		process.exit(isMatch ? 0 : 1);
	}
}
if (require.main === module) {
	main().catch(err => {
		console.error('未处理的错误:', err);
		console.log("Will exit 1");
		process.exit(1);
	});
}
