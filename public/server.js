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
const skiprender  = [
	"assets", 
	"image"
];

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
	const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
	let pathname = parsedUrl.pathname;
	
	// 处理形如 /path1/path2 的URL模式
	const pathParts = pathname.split('/').filter(part => part.length > 0);

	let consider = true;

	for (const match in skiprender) {
		if (pathParts[0] === skiprender[match]) {
			consider = false;
		}
	}
	
	if (consider && pathParts.length === 2) {
		// 匹配 /path1/path2 模式，将其转换为 /path1?id=path2
		const basePath = pathParts[0];
		const idValue = pathParts[1];
		
		// 构建新的路径：/path1.html
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
		
		console.log(`${req.socket.remoteAddress} : Original request: ${req.url}`);
		console.log(`${req.socket.remoteAddress} : Rewritten to: ${newFullPath}`);
		
		// 更新pathname为新的路径
		parsedUrl.pathname = newPathname;
		parsedUrl.search = queryString ? '?' + queryString : '';
		
		// 重新构建URL对象（使用新的路径）
		const newUrl = new URL(newFullPath, `http://${req.headers.host}`);
		pathname = newUrl.pathname;
	}
	
	// 获取本地文件路径
	let localFilePath = path.join(path.resolve('.'), pathname);
	
	// 记录请求信息
	console.log(`${req.socket.remoteAddress} : Request for ${localFilePath}`);

	fs.stat(localFilePath, (err, stats) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end('');
			return;
		}

		if (stats.isDirectory()) {
			localFilePath = path.join(localFilePath, '/index.html');
			fs.stat(localFilePath, (err, stats) => {
				if (err || !stats.isFile()) {
					res.writeHead(404, { 'Content-Type': 'text/html' });
					res.end('');
					return;
				}
				serveFile(localFilePath, res);
			});
		}
		else if (stats.isFile()) {
			serveFile(localFilePath, res);
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