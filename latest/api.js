const config = require('./config');
const webcon = require('./webcontact')
webcon.initializeConnections();
async function login(parsed_url, res) {
	try {
		const has_un = 'usrname' in parsed_url.query;
		const has_pw = 'paswd' in parsed_url.query;
		if (!has_un) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "usrname" lost');
			return;
		}
		if (!has_pw) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "paswd" lost');
			return;
		}
		const usrname = parsed_url.query.usrname;
		const paswd = parsed_url.query.paswd;
		const ret = await webcon.login(usrname, paswd);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to login', error);
	}
}
async function verify_cookie(parsed_url, res) {
	try {
		const has_ck = 'cookie' in parsed_url.query;
		if (!has_ck) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "cookie" lost');
			return;
		}
		const cookie = parsed_url.query.cookie;
		const ret = await webcon.verify_cookie(cookie);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to verify', error);
	}
}
async function updinfo(parsed_url, res) {
	try {
		const has_ck = 'cookie' in parsed_url.query;
		const has_un = 'usrname' in parsed_url.query;
		const has_pw = 'paswd' in parsed_url.query;
		const has_pl = 'pubcode' in parsed_url.query;
		if (!has_ck) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "cookie" lost');
			return;
		}
		if (!has_un) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "usrname" lost');
			return;
		}
		if (!has_pw) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "paswd" lost');
			return;
		}
		if (!has_pl) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Bad Request: Param "pubcode" lost');
			return;
		}
		const cookie = parsed_url.query.cookie;
		const usrname = parsed_url.query.usrname;
		const paswd = parsed_url.query.paswd;
		const pubcode = parsed_url.query.pubcode;
	}
	catch (error) {
		handle_api_err(res, 'Failed to update info', error);
	}
}
function handle_api_err(res, message, error) {
	console.error(`${message}:`, error);
	res.writeHead(500, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*'
	});
	res.end(JSON.stringify({
		status: 'error',
		message,
		error: error.message
	}));
}

module.exports = {
	verify_cookie,
	login
};