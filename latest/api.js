const config = require('./config');
const webcon = require('./webcontact')
webcon.initializeConnections();
function losepar(parname, parsed_url, res) {
	const has = parname in parsed_url.query;
	if (!has) {
		res.writeHead(400, { 'Content-Type': 'text/plain' });
		res.end(`Bad Request: Param "${parname}" lost`);
		return 1;
	}
	return 0;
}

async function login(parsed_url, res) {
	try {
		if (losepar('usrname', parsed_url, res)) return;
		if (losepar('paswd', parsed_url, res)) return;
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
		if (losepar('cookie', parsed_url, res)) return;
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
		if (losepar('cookie', parsed_url, res)) return;
		if (losepar('usrname', parsed_url, res)) return;
		if (losepar('paswd', parsed_url, res)) return;
		if (losepar('pubcode', parsed_url, res)) return;
		const cookie = parsed_url.query.cookie;
		const usrname = parsed_url.query.usrname;
		const paswd = parsed_url.query.paswd;
		const pubcode = parsed_url.query.pubcode;
		ret = await webcon.updinfo(cookie, usrname, paswd, pubcode);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret.content);
	}
	catch (error) {
		handle_api_err(res, 'Failed to update info', error);
	}
}
async function newchat(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url, res)) return;
		if (losepar('content', parsed_url, res)) return;
		const cookie = parsed_url.query.cookie;
		const content = parsed_url.query.content;
		ret = await webcon.newchat(cookie, content);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to create chat', error);
	}
}
async function postchat(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url, res)) return;
		if (losepar('cid', parsed_url, res)) return;
		if (losepar('content', parsed_url, res)) return;
		const cookie = parsed_url.query.cookie;
		const cid = parsed_url.query.cid;
		const content = parsed_url.query.content;
		ret = await webcon.postchat(cookie, cid, content);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to post chat', error);
	}
}
async function getchat(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url, res)) return;
		if (losepar('cid', parsed_url, res)) return;
		if (losepar('page', parsed_url, res)) return;
		const cookie = parsed_url.query.cookie;
		const cid = parsed_url.query.cid;
		const page = parsed_url.query.page;
		ret = await webcon.getchat(cookie, cid, page);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get chat', error);
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
	login,
	updinfo,

	newchat,
	postchat,
	getchat
};