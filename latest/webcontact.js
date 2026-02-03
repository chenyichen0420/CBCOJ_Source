const net = require('net');
const config = require('./config');
const EventEmitter = require('events');

/**
 * 长连接客户端（带简单锁机制）
 */
class PersistentJudgeClient extends EventEmitter {
	constructor(serverId, ip, port) {
		super();
		this.serverId = serverId;
		this.ip = ip;
		this.port = port;
		this.key = `${serverId}_${port}`;
		this.state = 'disconnected';
		this.socket = null;
		this.buffer = Buffer.alloc(0);
		this.reconnectTimer = null;
		this.reconnectDelay = 10000;

		// 简单的连接锁
		this.lock = false;
		this.waitingQueue = [];
		this.autoConnect = true;

		// 用于跟踪异步响应
		this.responseCallbacks = new Map(); // messageId -> {resolve, reject}
		this.nextMessageId = 1;
	}

	/**
	 * 连接到服务器
	 */
	connect() {
		if (this.state === 'connected' ||
			this.state === 'connecting') {
			return Promise.resolve(false);
		}

		this.state = 'connecting';

		return new Promise((resolve, reject) => {
			try {
				this.socket = new net.Socket();
				this.socket.setKeepAlive(true, 10000);
				this.socket.on('connect', () => {
					this.state = 'connected';
					console.log(`[${this.key}] Connected to ${this.ip}:${this.port}`);
					this.emit('connected', this.key);
					resolve(true);
				});
				this.socket.on('data', (data) => { this.handleData(data); });
				this.socket.on('error', (error) => {
					this.state = 'error';
					this.emit('error', error);
					this.scheduleReconnect();
					reject(error);
				});
				this.socket.on('close', (hadError) => {
					this.handleDisconnect();
				});
				this.socket.connect(this.port, this.ip);
			} catch (error) {
				this.state = 'error';
				this.scheduleReconnect();
				reject(error);
			}
		}).catch(error => {
			this.scheduleReconnect();
			return false;
		});
	}

	/**
	 * 处理断开连接
	 */
	handleDisconnect() {
		this.state = 'disconnected';
		this.cleanupSocket();

		// 清理所有等待的响应
		for (const [id, callback] of this.responseCallbacks.entries()) {
			callback.reject(new Error('Connection lost'));
		}
		this.responseCallbacks.clear();

		// 清理等待队列
		for (const waiting of this.waitingQueue) {
			waiting.reject(new Error('Connection lost'));
		}
		this.waitingQueue = [];

		this.emit('disconnected', this.key);
		if (this.autoConnect) this.scheduleReconnect();
	}

	/**
	 * 清理socket资源
	 */
	cleanupSocket() {
		if (this.socket) {
			this.socket.removeAllListeners();
			this.socket.destroy();
			this.socket = null;
		}
	}

	/**
	 * 安排重连
	 */
	scheduleReconnect() {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = setTimeout(() => {
			this.connect().catch(() => { this.scheduleReconnect(); });
		}, this.reconnectDelay);
	}

	/**
	 * 处理接收到的数据
	 */
	handleData(data) {
		this.buffer = Buffer.concat([this.buffer, data]);

		while (this.buffer.length >= 8) {
			const header = this.buffer.slice(0, 8).toString('ascii');
			const status = header[0];
			let length = this.expandNumber(header.slice(1, 8));

			if (this.buffer.length < 8 + length) break;

			const content = this.buffer.slice(8, 8 + length).toString('utf8');
			this.buffer = this.buffer.slice(8 + length);

			// 找到第一个等待的回调
			const firstKey = this.responseCallbacks.keys().next().value;
			if (firstKey) {
				const callback = this.responseCallbacks.get(firstKey);
				this.responseCallbacks.delete(firstKey);

				//if (status === 'E') {
				//	callback.reject(new Error(content));
				//} else {
					// 返回包含 status 和 content 的对象
					callback.resolve({ status, content });
				//}
			} else {
				// 如果没有回调，作为事件发出
				this.emit('message', { status, content });
			}
		}
	}

	/**
	 * 获取连接锁（确保同一连接上不会同时处理多个请求组）
	 */
	async acquireLock() {
		return new Promise((resolve, reject) => {
			if (!this.lock) {
				this.lock = true;
				resolve();
			} else {
				// 加入等待队列
				const timeoutId = setTimeout(() => {
					// 从等待队列中移除自己
					const index = this.waitingQueue.findIndex(item => item.reject === reject);
					if (index !== -1) {
						this.waitingQueue.splice(index, 1);
					}
					reject(new Error('Time out'));
				}, 5000);

				this.waitingQueue.push({
					resolve: () => {
						clearTimeout(timeoutId);
						resolve();
					},
					reject: () => {
						clearTimeout(timeoutId);
						reject(new Error('Time out'));
					}
				});
			}
		});
	}

	/**
	 * 释放连接锁
	 */
	releaseLock() {
		this.lock = false;
		if (this.waitingQueue.length > 0) {
			const next = this.waitingQueue.shift();
			this.lock = true;
			next.resolve();
		}
	}

	/**
	 * 发送消息并等待响应
	 * 返回一个包含 status 和 content 的对象
	 */
	async sendAndWait(command, data, timeout = 15000) {
		return new Promise((resolve, reject) => {
			if (this.state !== 'connected') {
				reject(new Error('Not connected'));
				return;
			}

			const messageId = this.nextMessageId++;
			const timer = setTimeout(() => {
				this.responseCallbacks.delete(messageId);
				reject(new Error('Request timeout'));
			}, timeout);

			this.responseCallbacks.set(messageId, {
				resolve: (result) => {
					clearTimeout(timer);
					resolve(result);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				}
			});

			this.sendRawMessage(command, data).catch(error => {
				clearTimeout(timer);
				this.responseCallbacks.delete(messageId);
				reject(error);
			});
		});
	}

	/**
	 * 发送消息（不等待响应）
	 */
	async sendOnly(command, data) {
		return this.sendRawMessage(command, data);
	}

	/**
	 * 发送原始消息
	 */
	sendRawMessage(command, data) {
		return new Promise((resolve, reject) => {
			if (this.state !== 'connected') {
				reject(new Error('Not connected'));
				return;
			}

			const dataBuffer = data ? Buffer.from(data, 'utf8') : Buffer.alloc(0);
			const length = data ? dataBuffer.length : 0;
			const header = command + length.toString().padStart(7, '0').split("").reverse().join("");
			const headerBuffer = Buffer.from(header, 'ascii');
			const fullMessage = Buffer.concat([headerBuffer, dataBuffer]);

			this.socket.write(fullMessage, (err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	/**
	 * 断开连接
	 */
	disconnect() {
		this.autoConnect = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.cleanupSocket();
		this.state = 'disconnected';
	}

	/**
	 * 扩展数字（反向解析）
	 */
	expandNumber(value) {
		let stringNumber = value.split("");
		while (isNaN(parseFloat(stringNumber[stringNumber.length - 1])) ||
			!isFinite(stringNumber[stringNumber.length - 1])) {
			stringNumber.pop();
		}
		return parseInt(stringNumber.reverse().join(""), 10);
	}

	/**
	 * 是否已连接
	 */
	isConnected() {
		return this.state === 'connected';
	}
}

/**
 * 连接管理器
 */
class ConnectionManager {
	constructor() {
		this.clients = new Map(); // key -> PersistentJudgeClient
		this.initialized = false;
		process.on('SIGINT', () => this.cleanup());
		process.on('SIGTERM', () => this.cleanup());
	}

	/**
	 * 初始化所有连接
	 */
	async initialize() {
		if (this.initialized) return;
		console.log('Initializing connections...');

		// 连接中间部分
		if (config.midip && config.midporta) {
			await this.createAndConnectClient(
				'middle',
				config.midip,
				config.midporta,
				'account'
			);
		}
		if (config.midip && config.midportm) {
			await this.createAndConnectClient(
				'middle',
				config.midip,
				config.midportm,
				'msg'
			);
		}

		// 连接所有评测机
		if (config.judgeServers && config.judgeServers.length > 0) {
			for (const server of config.judgeServers) {
				if (server.discPort) {
					await this.createAndConnectClient(
						server.id,
						server.ip,
						server.discPort,
						'disc'
					);
				}
				if (server.judgePort) {
					await this.createAndConnectClient(
						server.id,
						server.ip,
						server.judgePort,
						'judge'
					);
				}
				if (server.queryPort) {
					await this.createAndConnectClient(
						server.id,
						server.ip,
						server.queryPort,
						'query'
					);
				}
			}
		}

		this.initialized = true;
		console.log('Connections initialized');
		this.startReconnectMonitor();
	}

	/**
	 * 创建并连接客户端
	 */
	async createAndConnectClient(serverId, ip, port, type) {
		const key = `${serverId}_${port}`;
		if (this.clients.has(key)) return this.clients.get(key);

		const client = new PersistentJudgeClient(serverId, ip, port);
		this.clients.set(key, client);

		client.on('connected', (clientKey) => {
			console.log(`Client ${clientKey} connected`);
		});

		await client.connect().catch(() => { });
		return client;
	}

	/**
	 * 启动重连监控
	 */
	startReconnectMonitor() {
		// 每分钟检查一次所有连接状态
		setInterval(() => {
			for (const [key, client] of this.clients.entries()) {
				if (client.state === 'disconnected' && client.autoConnect) {
					console.log(`[Monitor] ${key} is disconnected, attempting to reconnect...`);
					client.connect().catch(() => {
						// 重连失败，继续等待下次检查
					});
				}
			}
		}, 60000);
	}

	/**
	 * 获取客户端
	 */
	getClient(serverId, port) {
		const key = `${serverId}_${port}`;
		return this.clients.get(key);
	}

	/**
	 * 获取中间部分客户端
	 */
	getMiddleA() {
		return this.getClient('middle', config.midporta);
	}
	getMiddleM() {
		return this.getClient('middle', config.midportm);
	}

	/**
	 * 获取评测机客户端
	 */
	getJudgeClient(serverId, type) {
		const server = config.judgeServerMap[serverId];
		if (!server) throw new Error(`Judge server ${serverId} not found`);

		let port;
		switch (type) {
			case 'disc':
				port = server.discPort;
				break;
			case 'judge':
				port = server.judgePort;
				break;
			case 'query':
				port = server.queryPort;
				break;
			default:
				throw new Error(`Unknown connection type: ${type}`);
		}

		return this.getClient(serverId, port);
	}

	/**
	 * 随机选择一个评测机
	 */
	selectJudgeServerId(type) {
		const availableServers = config.judgeServers.filter(server => {
			const client = this.getJudgeClient(server.id, type);
			return client && client.isConnected();
		});

		if (availableServers.length === 0) {
			return null;
		}

		const randomIndex = Math.floor(Math.random() * availableServers.length);
		const sellected = availableServers[randomIndex];

		return sellected.id;
	}

	/**
	 * 清理所有连接
	 */
	cleanup() {
		console.log('Cleaning up connections...');
		for (const [key, client] of this.clients.entries()) {
			try { client.disconnect(); }
			catch (error) { console.error(`Error disconnecting client ${key}:`, error.message); }
		}
		this.clients.clear();
		this.initialized = false;
	}
}

const connectionManager = new ConnectionManager();

async function initializeConnections() {
	await connectionManager.initialize();
}

function getuid(cookie) {
	if (!cookie || cookie.length < 2) return null;
	const lenChar = cookie[0];
	const uidLength = parseInt(lenChar, 10);
	if (isNaN(uidLength) || uidLength <= 0) return null;
	if (cookie.length < 1 + uidLength) return null;
	const uid = cookie.substring(1, 1 + uidLength);
	return uid;
}

function buildid(serverid, value) {
	const judgeIdHex = parseInt(serverid, 10).toString(16).padStart(2, '0');
	const submissionIdHex = parseInt(value, 10).toString(16).padStart(6, '0');
	return judgeIdHex.toUpperCase() + submissionIdHex.toUpperCase();
}

function parseid(fullId) {
	if (fullId.length !== 8) throw new Error("Invalid id");
	const hexRegex = /^[0-9a-fA-F]+$/;
	if (!hexRegex.test(fullId)) throw new Error('Invalid id');
	const serverid = parseInt(fullId.substring(0, 2), 16).toString(10);
	const value = parseInt(fullId.substring(2), 16);
	return { serverid, value };
}

/**
 * verify cookies
 * @param {any} cookie
 * @returns {string} "Y"/"N"
 */
async function verify_cookie(cookie) {
	const client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			const response = await client.sendAndWait('V', cookie);
			return response.content;
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to verify cookie:', error.message);
		return "N";
	}
}

/**
 * login to the system
 * @param {any} username
 * @param {any} password
 * @returns {Array} ["Y"/"N", cookie/error]
 */
async function login(username, password) {
	const client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			await client.sendOnly('L', username);
			const response = await client.sendAndWait('L', password);
			return response.content;
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to login:', error.message);
		return error.message;
	}
}

/**
 * get account info(short, only contains username and public code setting)
 * @param {any} cookie
 * @returns {Array} ["Y"/"N",[username, publiccode]/error]
 */
async function getinfoshort(cookie) {
	const client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			let response = await client.sendAndWait('V', cookie);
			if (response.content === "N") return `["N",${response.content}]`;
			const uids = getuid(cookie);
			response = await client.sendAndWait('Q', uids);
			return `["Y",${response.content}]`;
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to get account info:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * update account info
 * @param {any} cookie
 * @param {any} username
 * @param {any} password
 * @param {any} publiccode
 * @returns {string} "Y"/"N"
 */
async function updinfo(cookie, username, password, publiccode) {
	const client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			let response = await client.sendAndWait('C', cookie);
			if (response.content === "N") return "N";
			await client.sendOnly('U', username);
			await client.sendOnly('P', password);
			response = await client.sendAndWait('C', publiccode);
			return response.content;
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to update account info:', error.message);
		return "N";
	}
}

/**
 * start a publicdiscussion
 * @param {any} cookie
 * @param {any} content
 * @returns {Array} ["Y"/"N", cid/error]
 */
async function newdisc(cookie, content, title) {
	let client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			const response = await client.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to creatediscussion(cookie err):', error.message);
		return `["N",${error.message}]`;
	}
	//passed cookie check
	try {
		const server = connectionManager.selectJudgeServerId('disc');
		client = connectionManager.getJudgeClient(server, 'disc');
		if (!client || !client.isConnected()) throw new Error('Discussion server not connected');
		await client.acquireLock();
		try {
			await client.sendOnly('S', content);
			await client.sendOnly('S', title);
			const uids = getuid(cookie);
			const response = await client.sendAndWait('S', uids);
			if (response.status === "Y") {
				const nid = buildid(server, response.content);
				return `["Y",${nid}]`;
			}
			throw "IDK?";
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to creatediscussion:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * post adiscussion
 * @param {any} cookie
 * @param {any} cid
 * @param {any} content
 * @returns {string} "Y"/"N"
 */
async function postdisc(cookie, cid, content) {
	let client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			const response = await client.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to postdiscussion(cookie err):', error.message);
		return "N";
	}
	//passed cookie check
	try {
		const val = parseid(cid), uids = getuid(cookie);
		client = connectionManager.getJudgeClient(val.serverid, 'disc');
		if (!client || !client.isConnected()) throw new Error('Discussion server not connected');
		await client.acquireLock();
		try {
			await client.sendOnly('P', val.value.toString(10));
			await client.sendOnly('S', content);
			const response = await client.sendAndWait('S', uids);
			if (response.content === "Y") return "Y";
			throw "IDK?";
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to postdiscussion:', error.message);
		return "N";
	}
}

/**
 * fetch one page of adiscussion
 * @param {any} cookie
 * @param {any} cid
 * @param {any} page
 * @returns {Array} ["Y"/"N", [content list]/error]
 */
async function getdisc(cookie, cid, page) {
	let client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		await client.acquireLock();
		try {
			const response = await client.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client.releaseLock();
		}
	} catch (error) {
		console.error('Failed to getdiscussion(cookie err):', error.message);
		return `["N",${error.message}]`;
	}
	//passed cookie check
	try {
		const val = parseid(cid);
		client = connectionManager.getJudgeClient(val.serverid, 'disc');
		if (!client || !client.isConnected()) throw new Error('Discussion server not connected');
		await client.acquireLock();
		try {
			await client.sendOnly('G', val.value.toString(10));
			const response = await client.sendAndWait('S', page);
			if (response.status === "Y") return `["Y",${response.content}]`;
			throw "IDK?";
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to getdiscussion:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * submit a code to the judge server
 * @param {any} cookie
 * @param {any} pid
 * @param {any} lan
 * @param {any} code
 * @returns {Array} ["Y"/"N",rid/error]
 */
async function submit(cookie, pid, lan, code) {
	if (
		lan !== "C++14-O2" && lan !== "c++14-O2" &&
		lan !== "C++17-O2" && lan !== "c++17-O2" &&
		lan !== "C++20-O2" && lan !== "c++20-O2" &&
		lan !== "C++14" && lan !== "c++14" &&
		lan !== "C++17" && lan !== "c++17" &&
		lan !== "C++20" && lan !== "c++20"
	) {
		console.error('Failed to submit(unsupported language)');
		return `["N","unsupported language"]`;
	}
	const client1 = connectionManager.getMiddleA();
	try {
		if (!client1 || !client1.isConnected()) throw new Error('Account server not connected');
		await client1.acquireLock();
		try {
			const response = await client1.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client1.releaseLock();
		}
	} catch (error) {
		console.error('Failed to submit(cookie err):', error.message);
		return `["N",${error.message}]`;
	}
	//passed cookie check
	try {
		const server = connectionManager.selectJudgeServerId('judge');
		const client = connectionManager.getJudgeClient(server, 'judge');
		if (!client || !client.isConnected()) throw new Error('Judge server not connected');
		await client.acquireLock();
		try {
			const uids = getuid(cookie);
			let response = await client.sendAndWait('S', uids);
			if (response.status === "E") return `["N",${response.content}]`;
			response = await client.sendAndWait('O', pid);
			if (response.status === "E") return `["N",${response.content}]`;
			await client.sendOnly('O', lan);
			response = await client.sendAndWait('F', code);
			if (response.status !== "O") throw response.content;
			const nid = buildid(server, response.content);

			// 对account server加锁
			await client1.acquireLock();
			try {
				await client1.sendOnly('R', uids);
				await client1.sendOnly('R', nid);
			} finally {
				client1.releaseLock();
			}
			return `["Y","${nid}"]`;
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to submit:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * get a single record, but detail
 * @param {any} cookie
 * @param {any} rid
 * @returns {Array} ["P"/"N",partical_result_JSON/error] / ["Y",result_JSON,code] 
 */
async function getrecord(cookie, rid) {
	const client1 = connectionManager.getMiddleA();
	try {
		if (!client1 || !client1.isConnected()) throw new Error('Account server not connected');
		await client1.acquireLock();
		try {
			const response = await client1.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client1.releaseLock();
		}
	} catch (error) {
		console.error('Failed to get record(cookie err):', error.message);
		return `["N",${error.message}]`;
	}
	//passed cookie check
	try {
		const val = parseid(rid);
		const client = connectionManager.getJudgeClient(val.serverid, 'query');
		if (!client || !client.isConnected()) throw new Error('Judge server not connected');
		await client.acquireLock();
		try {
			let response = await client.sendAndWait('R', val.value.toString(10));
			if (response.status === "E") {
				//just informs that this record file doesn't currently exists
				//try to fetch short result instead
				response = await client.sendAndWait('Q', val.value.toString(10));
				const res = JSON.parse(response.content)
				if (res.pts < 0) throw new Error('Bad record ID');
				else return `["P",${response.content}]`;
			}
			const reslt = response.content;
			const uid = JSON.parse(reslt).uid.toString();

			// 对account server加锁
			await client1.acquireLock();
			try {
				await client1.sendOnly('A', cookie);
				response = await client1.sendAndWait('A', uid);
				if (response.status !== "O") return `["Y",${reslt},"//You're not allowed to view this code!!!"]`;
			} finally {
				client1.releaseLock();
			}

			response = await client.sendAndWait('C', val.value.toString(10));
			const obj = ["Y", reslt, response.content];
			return JSON.stringify(obj, null, 2);
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to get record:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * get a list of records
 * @param {any} cookie
 * @param {any} page
 * @returns {Array} ["Y"/"N",[record list]/error]
 */
async function getrecordlist(cookie, page) {
	const client1 = connectionManager.getMiddleA();
	try {
		if (!client1 || !client1.isConnected()) throw new Error('Account server not connected');
		await client1.acquireLock();
		try {
			let response = await client1.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
			const uids = getuid(cookie);
			await client1.sendOnly('G', uids);
			response = await client1.sendAndWait('G', page);
			if (response.status === "O") return `["Y",${response.content}]`;
			else return `["N",${response.content}]`;
		} finally {
			client1.releaseLock();
		}
	} catch (error) {
		console.error('Failed to get record:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * post a private message
 * @param {any} cookie
 * @param {any} target
 * @param {any} content
 * @returns {String} "Y"/"N"
 */
async function postmsg(cookie, target, content) {
	const client = connectionManager.getMiddleM();
	const client1 = connectionManager.getMiddleA();
	try {
		if (!client1 || !client1.isConnected()) throw new Error('Account server not connected');
		if (!client || !client.isConnected()) throw new Error('Message server not connected');
		await client1.acquireLock();
		try {
			let response = await client1.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client1.releaseLock();
		}

		await client.acquireLock();
		try {
			const uids = getuid(cookie);
			await client.sendOnly('R', uids);
			await client.sendOnly('R', content);
			const response = await client.sendAndWait('R', target);
			if (response.status === "O") return "Y";
			else return "N";
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to get post message:', error.message);
		return "N";
	}
}

/**
 * get one page of messages
 * @param {any} cookie
 * @param {any} page
 * @returns {Array} ["Y"/"N",[message list]/error]
 */
async function getmsg(cookie, page) {
	const client = connectionManager.getMiddleM();
	const client1 = connectionManager.getMiddleA();
	try {
		if (!client1 || !client1.isConnected()) throw new Error('Account server not connected');
		if (!client || !client.isConnected()) throw new Error('Message server not connected');
		await client1.acquireLock();
		try {
			let response = await client1.sendAndWait('V', cookie);
			if (response.content !== "Y") throw "IDK?";
		} finally {
			client1.releaseLock();
		}

		await client.acquireLock();
		try {
			const uids = getuid(cookie);
			await client.sendOnly('G', uids);
			response = await client.sendAndWait('G', page);
			if (response.status === "O") return `["Y",${response.content}]`;
			else return `["N",${response.content}]`;
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to get post message:', error.message);
		return `["N",${error.message}]`;
	}
}

async function updproblemlist() {
	const server = connectionManager.selectJudgeServerId('judge');
	const client = connectionManager.getJudgeClient(server, 'judge');
	try {
		if (!client || !client.isConnected()) throw new Error('Problem server not connected');
		await client.acquireLock();
		try {
			const ret = await client.sendAndWait('V', config.verinfo);
			return ret.content;
		} finally {
			client.releaseLock();
		}
	}
	catch (error) {
		console.error('Failed to update problem list:', error.message);
		return "[]";
	}
}

module.exports = {
	initializeConnections,

	//API functions
	//account
	verify_cookie,
	login,
	getinfoshort,
	updinfo,

	//disc
	newdisc,
	postdisc,
	getdisc,

	//submit
	submit,

	//record(list)
	getrecord,
	getrecordlist,

	//message
	postmsg,
	getmsg,

	//problem list
	updproblemlist
};