const fs = require('fs');
const path = require('path');
const config = require('./config');
const webcon = require('./webcontact')
const lgmsg = require('./lgmsg');
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

async function genregtoken(parsed_url, res) {
	try {
		if (losepar('usrname', parsed_url.query, res)) return;
		if (losepar('paswd', parsed_url.query, res)) return;
		if (losepar('uid', parsed_url.query, res)) return;
		const usrname = parsed_url.query.usrname;
		const paswd = parsed_url.query.paswd;
		const uid = parsed_url.query.uid;
		let msg = await lgmsg.lggetmsg(config.lguid, config.lgcookie, uid);
		if (!msg.success || msg.message.content !== "cbcoj-register") {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end('["N", "register message check failed"]');
			return;
		}
		const ret = await webcon.genreginfo(usrname, paswd, uid);
		const JS = JSON.parse(ret);
		if (JS.length !== 3) {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(JSON.stringify([JS[0], JS[1]]));
			return;
		}
		const msgcontent = `Welcome to CBCOJ. Here is your registration verification code:${JS[2]}.`;
		msg = await lgmsg.lgsndmsg(config.lguid, config.lgcookie, uid, msgcontent);
		if (!msg.success) {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end('["N", "register code sending failed"]');
			return;
		}
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(JSON.stringify([JS[0], JS[1]]));
	}
	catch (error) {
		handle_api_err(res, 'Failed to generate register info', error);
	}
}
async function verifycode(parsed_url, res) {
	try {
		if (losepar('token', parsed_url.query, res)) return;
		if (losepar('code', parsed_url.query, res)) return;
		const token = parsed_url.query.token;
		const code = parsed_url.query.code;
		const ret = await webcon.verifycode(token, code);
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to verify register code', error);
	}
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
		if (losepar('key', parsed_url.query, res)) return;
		const key = parsed_url.query.key;
		const ret = await webcon.getinfoshort(key);
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
		if (pubcode !== 'yes' && pubcode !== 'no') {
			res.writeHead(200, {
				'Content-Type': 'text/plain',
				'Access-Control-Allow-Origin': '*'
			});
			res.end("N");
			return;
		}
		ret = await webcon.updinfo(cookie, usrname, paswd, pubcode);
		res.writeHead(200, {
			'Content-Type': 'text/plain',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to update info', error);
	}
}
async function newdisc(body, res) {
	try {
		if (losepar('cookie', body, res)) return;
		if (losepar('content', body, res)) return;
		if (losepar('title', body, res)) return;
		const cookie = body.cookie;
		let content = body.content;
		let title = body.title;
		if (title.length > 25) {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(`["N","Title too long"]`);
			return;
		}
		if (content.length > 380) {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(`["N","Content too long"]`);
			return;
		}
		title = encodeURIComponent(title);
		content = encodeURIComponent(title);
		const ret = await webcon.newdisc(cookie, content, title);
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
async function postdisc(body, res) {
	try {
		if (losepar('cookie', body, res)) return;
		if (losepar('cid', body, res)) return;
		if (losepar('content', body, res)) return;
		const cookie = body.cookie;
		const cid = body.cid;
		let content = body.content;
		if (content.length > 380) {
			res.writeHead(200, {
				'Content-Type': 'text/plain',
				'Access-Control-Allow-Origin': '*'
			});
			res.end("N");
			return;
		}
		content = encodeURIComponent(content);
		const ret = await webcon.postdisc(cookie, cid, content);
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
		const ret = await webcon.getdisc(cookie, cid, page);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get discussion', error);
	}
}
async function getdisclist(parsed_url, res) {
	try {
		const ret = await webcon.getdisclist();
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(ret);
	}
	catch (error) {
		handle_api_err(res, 'Failed to get discussion list', error);
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
		let code = body.code;
		if (code.length >= 102400) {
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Access-Control-Allow-Origin': '*'
			});
			res.end(`["N","code too long"]`);
			return;
		}
		code = Buffer.from(code, 'utf8').toString('base64');
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
		ret = await webcon.getrecordlist(cookie, page);
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
async function postmsg(body, res) {
	try {
		if (losepar('cookie', body, res)) return;
		if (losepar('target', body, res)) return;
		if (losepar('content', body, res)) return;
		const cookie = body.cookie;
		const target = body.target;
		const content = body.content;
		if (content.length > 80) {
			res.writeHead(200, {
				'Content-Type': 'text/plain',
				'Access-Control-Allow-Origin': '*'
			});
			res.end("N");
			return;
		}
		content = encodeURIComponent(content);
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
			if (err) {
				res.writeHead(200, {
					'Content-Type': 'text/plain',
					'Access-Control-Allow-Origin': '*'
				});
				res.end("Problem not found");
				return;
			}
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
		let result = problemlist.slice((page - 1) * 10, page * 10);
		result = JSON.stringify(result);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		});
		res.end(`["Y",${result},${problemlist.length}]`);
	}
	catch (error) {
		res.end(`["N","Failed to get problem list"]`);
		//handle_api_err(res, 'Failed to get problem list', error);
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
	genregtoken,
	verifycode,

	verify_cookie,
	login,
	getinfoshort,
	updinfo,

	newdisc,
	postdisc,
	getdisc,
	getdisclist,

	submit,

	getrecord,
	getrecordlist,

	postmsg,
	getmsg,

	getproblem,
	getproblemlist,
	updproblemlist
};