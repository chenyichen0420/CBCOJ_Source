const http = require('http');
const url = require('url')
const config = require('./config')
const api = require('./api');

async function periodic_tasks() {

}
setInterval(periodic_tasks, 2 * 60 * 1000);

let curdir = __dirname;
const isBun = typeof Bun !== 'undefined';
if (isBun) {
	curdir = path.resolve("./");
}

const server = http.createServer((req, res) => {
	const userAgent = req.headers['user-agent'];
	if (!userAgent || userAgent.includes('bot') || userAgent.includes('crawler') || userAgent.includes('spider')) {
		res.writeHead(403, { 'Content-Type': 'text/plain' });
		res.end('Forbidden: Crawlers not allowed');
		return;
	}
	//basic crawler check (useless, wanna remove)
	if (req.url.startsWith('/statics/')) {

		return;
	}
	if (req.url.startsWith('/api/')) {
		handle_api(req, res);
		return;
	}

	res.writeHead(400, { 'Content-Type': 'text/plain' });
	res.end('Bad request: Unknown interface');
	return;
})

async function handle_api(req, res) {
	const parsed_url = url.parse(req.url, true);
	if (parsed_url.pathname === '/api/verifycookie')
		if (req.method === 'GET')
			api.verify_cookie(parsed_url, res);
		else
			res.writeHead(403, { 'Content-Type': 'text/plain' }),
				res.end('Forbidden: Request method not allowed');
	else if (parsed_url.pathname === '/api/login')
		if (req.method === 'GET')
			api.login(parsed_url, res);
		else
			res.writeHead(403, { 'Content-Type': 'text/plain' }),
				res.end('Forbidden: Request method not allowed');
	else
		res.writeHead(400, { 'Content-Type': 'text/plain' }),
			res.end('Bad request: Unknown interface');
}

server.listen(config.port, () => {
	console.log(`Server running at http://localhost:${config.port}/`);
	console.log(`Judging System Version: ${config.verinfo}`);
	console.log(`Configured ${config.judgeServers.length} judge servers:`);
	config.judgeServers.forEach(server => {
		console.log(`	${server.id}: ${server.name} (${server.ip})`);
	});
	periodic_tasks();
});