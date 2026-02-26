const http = require('http');
const path = require('path');
const url = require('url');
const fs = require('fs');

const mimeTypes = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain'
};

const skiprender = [
	"assets",
	"image",
	"archive"
];

// 允许的本地回环地址列表（支持常见格式）
const ALLOWED_LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

// ---------- 限流器 ----------
const rateLimiter = new Map(); // IP -> 时间戳数组（毫秒）

/**
 * 检查并记录请求频率
 * @param {string} ip 客户端真实IP
 * @returns {boolean} true表示允许通过，false表示超过限制
 */
function checkRateLimit(ip) {
	const now = Date.now();
	const windowMs = 1000; // 1秒窗口
	const maxRequests = 100;

	if (!rateLimiter.has(ip)) {
		rateLimiter.set(ip, []);
	}
	const timestamps = rateLimiter.get(ip);
	// 加入当前请求的时间戳
	timestamps.push(now);
	// 过滤掉超过1秒的旧时间戳
	const filtered = timestamps.filter(ts => ts > now - windowMs);
	// 更新存储（只保留窗口内的）
	rateLimiter.set(ip, filtered);
	// 判断是否超过限制
	return filtered.length <= maxRequests;
}
// ---------------------------

// 辅助函数：获取客户端真实 IP
function getClientIP(req) {
	// Cloudflare Tunnel 会添加此头部，优先使用
	const cfIP = req.headers['cf-connecting-ip'];
	if (cfIP) return cfIP;

	// 否则使用连接的真实来源 IP（此时应为 127.0.0.1 或 ::1）
	// 移除 IPv6 映射前缀 ::ffff:，以便于显示
	return req.socket.remoteAddress.replace(/^::ffff:/, '');
}

async function serveFile(filePath, res) {
	const ext = path.extname(filePath);
	const contentType = mimeTypes[ext] || 'application/octet-stream';

	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end('Server error');
			return;
		}

		res.writeHead(200, { 'Content-Type': contentType });
		res.end(data);
	});
}

const server = http.createServer((req, res) => {
	// ---------- 连接来源限制 ----------
	const remoteAddr = req.socket.remoteAddress;
	if (!ALLOWED_LOOPBACK.includes(remoteAddr)) {
		console.warn(`[${new Date().toLocaleString()}] Blocked connection from ${remoteAddr} (not allowed)`);
		res.writeHead(403, { 'Content-Type': 'text/plain' });
		res.end('Forbidden');
		return;
	}

	// ---------- 获取真实IP并选择性限流 ----------
	const clientIP = getClientIP(req);
	// 条件：仅当请求来自 Cloudflare Tunnel（即存在 cf-connecting-ip 头）时才限流
	// 本地直接访问（无 cf 头且 remoteAddr 为回环地址）跳过限流
	if (req.headers['cf-connecting-ip']) {
		if (!checkRateLimit(clientIP)) {
			// 超过频率限制，返回429
			console.warn(`[${new Date().toLocaleString()}] Rate limit exceeded for ${clientIP}`);
			res.writeHead(429, {
				'Content-Type': 'text/plain',
				'Retry-After': '1'
			});
			res.end('Too Many Requests');
			return;
		}
	}
	// -------------------------------------

	// 1. 限制请求方法
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405, { 'Content-Type': 'text/plain' });
		res.end('Method Not Allowed');
		return;
	}

	const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
	let pathname = parsedUrl.pathname;

	// 处理形如 /path1/path2 的URL模式
	const pathParts = pathname.split('/').filter(part => part.length > 0);

	let consider = true;
	for (const item of skiprender) {
		if (pathParts[0] === item) {
			consider = false;
			break;
		}
	}

	if (consider && pathParts.length === 2) {
		// 匹配 /path1/path2 模式，将其转换为 /path1?id=path2
		const basePath = pathParts[0];
		const idValue = pathParts[1];

		// 构建新的路径：/path1/
		const newPathname = '/' + basePath + '/';

		// 获取原始查询参数
		const originalParams = parsedUrl.searchParams;

		// 创建新的URLSearchParams对象
		const newParams = new URLSearchParams();

		// 添加id参数
		newParams.set('id', idValue);

		// 添加原始查询参数（如果存在）
		originalParams.forEach((value, key) => {
			newParams.set(key, value);
		});

		// 构建新的完整URL
		const queryString = newParams.toString();
		const newFullPath = newPathname + (queryString ? '?' + queryString : '');

		console.log(`${clientIP} : Original request: ${req.url}`);
		console.log(`${clientIP} : Rewritten to: ${newFullPath}`);

		// 更新pathname为新的路径
		parsedUrl.pathname = newPathname;
		parsedUrl.search = queryString ? '?' + queryString : '';

		// 重新构建URL对象（使用新的路径）
		const newUrl = new URL(newFullPath, `http://${req.headers.host}`);
		pathname = newUrl.pathname;
	}

	// 2. 路径遍历漏洞修复：定义网站根目录，并验证请求路径是否在根目录内
	const root = path.resolve('.'); // 服务器运行的当前目录作为根目录

	// 获取相对于根目录的路径（去除开头的 /）
	const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
	// 解析为绝对路径（自动处理 .. 和 .）
	const fullPath = path.resolve(root, relativePath);

	// 安全检查：确保 fullPath 位于 root 目录内
	if (fullPath !== root && !fullPath.startsWith(root + path.sep)) {
		console.warn(`Blocked path traversal attempt: ${req.url} -> ${fullPath}`);
		res.writeHead(403, { 'Content-Type': 'text/plain' });
		res.end('Forbidden');
		return;
	}

	// 记录请求信息（使用 clientIP）
	console.log(`${new Date().toLocaleString()} ${clientIP} : Request for ${fullPath}`);

	// 后续所有文件操作均使用安全的 fullPath
	fs.stat(fullPath, (err, stats) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end('');
			return;
		}

		if (stats.isDirectory()) {
			const indexPath = path.join(fullPath, 'index.html');
			fs.stat(indexPath, (err, stats) => {
				if (err || !stats.isFile()) {
					res.writeHead(404, { 'Content-Type': 'text/html' });
					res.end('');
					return;
				}
				serveFile(indexPath, res);
			});
		}
		else if (stats.isFile()) {
			serveFile(fullPath, res);
		}
		else {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end('');
		}
	});
});

server.listen(1999, () => {
	console.log('Server running at http://localhost:1999/');
});
