const http = require('http');
const url = require('url')
const config = require('./config')
const api = require('./api');
function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
async function periodic_tasks() {
	await wait(2000)
	try {
		await api.updproblemlist();
	}
	catch (error) {

	}
	//console.log(`periodic tasks runned`)
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
		res.writeHead(403, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
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

	res.writeHead(400, {
		'Content-Type': 'text/plain',
		'Access-Control-Allow-Origin': '*'
	});
	res.end('Bad request: Unknown interface');
	return;
})

function method_not_allowed(res) {
	res.writeHead(403, {
		'Content-Type': 'text/plain',
		'Access-Control-Allow-Origin': '*'
	});
	res.end('Forbidden: Request method not allowed');
}
async function handle_api(req, res) {
	if (req.method === 'OPTIONS') {
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': '*',
			'Access-Control-Allow-Headers': '*'
		});
		res.end()
		return;
	}
	const parsed_url = url.parse(req.url, true);
	if (parsed_url.pathname === '/api/verifycookie')
		if (req.method === 'GET')
			api.verify_cookie(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/login')
		if (req.method === 'GET')
			api.login(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/getinfoshort')
		if (req.method === 'GET')
			api.getinfoshort(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/updinfo')
		if (req.method === 'GET')
			api.updinfo(parsed_url, res);
		else method_not_allowed(res);

	else if (parsed_url.pathname === '/api/newdisc')
		if (req.method === 'GET')
			api.newdisc(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/postdisc')
		if (req.method === 'GET')
			api.postdisc(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/getdisc')
		if (req.method === 'GET')
			api.getdisc(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/getdisclist')
		if (req.method === 'GET')
			api.getdisclist(parsed_url, res);
		else method_not_allowed(res);


	else if (parsed_url.pathname === '/api/record')
		if (req.method === 'GET')
			api.getrecord(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/recordlist')
		if (req.method === 'GET')
			api.getrecordlist(parsed_url, res);
		else method_not_allowed(res);

	else if (parsed_url.pathname === '/api/postmsg')
		if (req.method === 'GET')
			api.postmsg(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/getmsg')
		if (req.method === 'GET')
			api.getmsg(parsed_url, res);
		else method_not_allowed(res);

	else if (parsed_url.pathname === '/api/getproblem')
		if (req.method === 'GET')
			api.getproblem(parsed_url, res);
		else method_not_allowed(res);
	else if (parsed_url.pathname === '/api/getproblemlist')
		if (req.method === 'GET')
			api.getproblemlist(parsed_url, res);
		else method_not_allowed(res);

	else if (parsed_url.pathname === '/api/submit')
		if (req.method === 'POST') {
			let body = '';
			req.setEncoding('utf8');
			req.on('data', chunk => {
				body += chunk.toString();
			});
			req.on('end', () => {
				try {
					const bodyData = body ? JSON.parse(body) : {};
					api.submit(bodyData, res);
				} catch (error) {
					console.log(error)
					res.writeHead(500, {
						'Content-Type': 'text/plain',
						'Access-Control-Allow-Origin': '*'
					});
					res.end('Server Internal Error');
				}
			});
		}
		else method_not_allowed(res);
	else
		res.writeHead(400, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		}),
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