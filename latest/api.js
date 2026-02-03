const fs = require('fs');
const path = require('path');
const config = require('./config');
const webcon = require('./webcontact')
webcon.initializeConnections();
function losepar(parname, query, res) {
	const has = parname in query;
	if (!has) {
		res.writeHead(400, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
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
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
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
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to verify', error);
	}
}
async function getinfoshort(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		ret = await webcon.getinfoshort(cookie);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get short info', error);
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
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret.content);
	}
	catch (error) {
		handle_api_err(res, 'Failed to update info', error);
	}
}
async function newdisc(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('content', parsed_url.query, res)) return;
		if (losepar('title', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const content = parsed_url.query.content;
		const title = parsed_url.query.title;
		ret = await webcon.newdisc(cookie, content, title);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to creatediscussion', error);
	}
}
async function postdisc(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('cid', parsed_url.query, res)) return;
		if (losepar('content', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const cid = parsed_url.query.cid;
		const content = parsed_url.query.content;
		ret = await webcon.postdisc(cookie, cid, content);
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to postdiscussion', error);
	}
}
async function getdisc(parsed_url, res) {
	try {
		if (losepar('cookie', parsed_url.query, res)) return;
		if (losepar('cid', parsed_url.query, res)) return;
		if (losepar('page', parsed_url.query, res)) return;
		const cookie = parsed_url.query.cookie;
		const cid = parsed_url.query.cid;
		const page = parsed_url.query.page;
		ret = await webcon.getdisc(cookie, cid, page);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to getdiscussion', error);
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
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
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
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
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
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
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
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
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
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get record list', error);
	}
}
async function getproblem(parsed_url, res) {
	try {
		if (losepar('pid', parsed_url.query, res)) return;
		const file = `${parsed_url.query.pid}.json`;
		fs.readFile(path.join(config.problempath, file), 'utf8', (err, data) => {
			if (err) throw new Error(err);
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(data);
		})
	}
	catch (error) {
		handle_api_err(res, 'Failed to get problem detail', error);
	}
}

let problemlist = [];

async function getproblemlist(parsed_url, res) {
	try {
		if (losepar('page', parsed_url.query, res)) return;
		const page = parsed_url.query.page;
		const result = problemlist.slice((page - 1) * 10, page * 10);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(JSON.stringify(result));
	}
	catch (error) {
		handle_api_err(res, 'Failed to get problem list', error);
	}
}
async function updproblemlist() {
	const ret = await webcon.updproblemlist();
	problemlist = JSON.parse(ret);
}

function handle_api_err(res, message, error) {
	console.error(`${message}:`, error);
	res.writeHead(500, {
		'Content-Type': 'text/plain',
		'Access-Control-Allow-Origin': '*'
	});
	res.end('Server Internal Error');
}

module.exports = {
	verify_cookie,
	login,
	getinfoshort,
	updinfo,

	newdisc,
	postdisc,
	getdisc,

	submit,

	getrecord,
	getrecordlist,

	postmsg,
	getmsg,

	getproblem,
	getproblemlist,
	updproblemlist
};