const config = require('./config');
const webcon = require('./webcontact')
webcon.initializeConnections();
function losepar(parname, query, res) {
	const has = parname in query;
	if (!has) {
		res.writeHead(400, { 'Content-Type': 'text/plain' });
		res.end(`Bad Request: Param "${parname}" lost`);
		return 1;
	}
	return 0;
}

async function login(parsed_url, res) {
	try {
		if (losepar('usrname', parsed_url.query, res)) return;
		if (losepar('paswd', parsed_url.query, res)) return;
		const usrname = parsed_url.query.usrname;
		const paswd = parsed_url.query.paswd;
		const ret = await webcon.login(usrname, paswd);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to login', error);
	}
}
async function verify_cookie(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
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
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('usrname', parsed_url.query, res)) return;
		if (losepar('paswd', parsed_url.query, res)) return;
		if (losepar('pubcode', parsed_url.query, res)) return;
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
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('content', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const content = parsed_url.query.content;
		ret = await webcon.newchat(cookie, content);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to create chat', error);
	}
}
async function postchat(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('cid', parsed_url.query, res)) return;
		if (losepar('content', parsed_url.query, res)) return;
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
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('cid', parsed_url.query, res)) return;
		if (losepar('page', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const cid = parsed_url.query.cid;
		const page = parsed_url.query.page;
		ret = await webcon.getchat(cookie, cid, page);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get chat', error);
	}
}
async function submit(body, res) {
	try {
		if (losepar('cookie', body, res)) return;
		if (losepar('pid', body, res)) return;
		if (losepar('lan', body, res)) return;
		if (losepar('code', body, res)) return;
		const cookie = body.cookie;
		const pid = body.pid;
		const lan = body.lan;
		const code = body.code;
		ret = await webcon.submit(cookie, pid, lan, code);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to submit', error);
	}
}
async function getrecord(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('rid', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const rid = parsed_url.query.rid;
		ret = await webcon.getrecord(cookie, rid);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get record', error);
	}
}
async function getrecordlist(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('page', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const page = parsed_url.query.page;
		ret = await webcon.getrecord(cookie, page);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get record list', error);
	}
}
async function postmsg(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('target', parsed_url.query, res)) return;
		if (losepar('content', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const target = parsed_url.query.target;
		const content = parsed_url.query.content;
		ret = await webcon.postmsg(cookie, target, content);
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get record list', error);
	}
}
async function getmsg(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('page', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const page = parsed_url.query.page;
		ret = await webcon.getmsg(cookie, page);
		res.writeHead(200, { 'Content-Type': 'text/json' });
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get record list', error);
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
	getchat,

	submit,

	getrecord,
	getrecordlist,

	postmsg,
	getmsg
};