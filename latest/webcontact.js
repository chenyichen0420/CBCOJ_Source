const net = require('net');
const config = require('./config');
const EventEmitter = require('events');
const ConnectionState = {
	DISCONNECTED: 'disconnected',
	CONNECTING: 'connecting',
	CONNECTED: 'connected',
	ERROR: 'error'
};
const ConnectionType = {
	JUDGE_DISC: 'judge_disc',
	JUDGE_SUBMIT: 'judge_submit',
	JUDGE_QUERY: 'judge_query',
	MIDDLE_ACCOUNT: 'middle_account',
	MIDDLE_MSG: 'middle_msg'
};
const Events = {
	CONNECTED: 'connected',
	DISCONNECTED: 'disconnected',
	ERROR: 'error',
	MESSAGE: 'message'
};

/**
 * 长连接客户端（带简单锁机制）
 */
class PersistentJudgeClient extends EventEmitter {
	constructor(serverId, ip, port, type) {
		super();
		this.serverId = serverId;
		this.ip = ip;
		this.port = port;
		this.type = type;
		this.key = `${type}_${serverId}_${port}`;
		this.state = ConnectionState.DISCONNECTED;
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

		// 新增：外部连接锁（用于手动控制连接独占）
		this._externalLock = false; // 锁状态
		this._externalLockQueue = []; // 等待队列
		this._externalLockHolder = null; // 锁持有者标识
	}

	/**
	 * 连接到服务器
	 */
	connect() {
		if (this.state === ConnectionState.CONNECTED ||
			this.state === ConnectionState.CONNECTING) {
			return Promise.resolve(false);
		}

		this.state = ConnectionState.CONNECTING;

		return new Promise((resolve, reject) => {
			try {
				this.socket = new net.Socket();
				this.socket.setKeepAlive(true, 10000);
				// 移除了 socket.setTimeout(30000);
				this.socket.on('connect', () => {
					this.state = ConnectionState.CONNECTED;
					console.log(`[${this.key}] Connected to ${this.ip}:${this.port}`);
					this.emit(Events.CONNECTED, this.key);
					resolve(true);
				});
				this.socket.on('data', (data) => { this.handleData(data); });
				this.socket.on('error', (error) => {
					this.state = ConnectionState.ERROR;
					this.emit(Events.ERROR, error);
					this.scheduleReconnect();
					reject(error);
				});
				// 移除了 timeout 事件监听器
				this.socket.on('close', (hadError) => {
					this.handleDisconnect();
				});
				this.socket.connect(this.port, this.ip);
			} catch (error) {
				this.state = ConnectionState.ERROR;
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
		this.state = ConnectionState.DISCONNECTED;
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

		this.emit(Events.DISCONNECTED, this.key);
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
				this.emit(Events.MESSAGE, { status, content });
			}
		}
	}

	/**
	 * 获取连接锁（确保同一连接上不会同时处理多个请求组）
	 */
	async acquireLock() {
		return new Promise((resolve) => {
			if (!this.lock) {
				this.lock = true;
				resolve();
			} else {
				this.waitingQueue.push({ resolve });
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
	 * 执行带锁的操作
	 */
	async executeWithLock(operation) {
		await this.acquireLock();
		try {
			return await operation();
		} finally {
			this.releaseLock();
		}
	}

	/**
	 * 发送消息并等待响应
	 * 返回一个包含 status 和 content 的对象
	 */
	async sendAndWait(command, data, timeout = 15000) {
		return this.executeWithLock(async () => {
			return new Promise((resolve, reject) => {
				if (this.state !== ConnectionState.CONNECTED) {
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
			if (this.state !== ConnectionState.CONNECTED) {
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
		this.state = ConnectionState.DISCONNECTED;
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
	 * 获取连接状态
	 */
	getState() { return this.state; }

	/**
	 * 是否已连接
	 */
	isConnected() {
		return this.state === ConnectionState.CONNECTED;
	}

	async lock(timeout = 1000) {
		if (this._externalLock) {
			// 锁已被持有，尝试等待
			return new Promise((resolve) => {
				const timer = setTimeout(() => {
					// 从等待队列中移除
					const index = this._externalLockQueue.findIndex(item => item.resolve === resolve);
					if (index !== -1) {
						this._externalLockQueue.splice(index, 1);
					}
					resolve(false); // 超时返回失败
				}, timeout);

				this._externalLockQueue.push({
					resolve: (result) => {
						clearTimeout(timer);
						resolve(result);
					}
				});
			});
		} else {
			// 直接获取锁
			this._externalLock = true;
			this._externalLockHolder = Date.now(); // 记录锁持有时间
			return true;
		}
	}

	/**
	 * 释放连接锁
	 * @returns {boolean} 是否成功释放锁
	 */
	unlock() {
		if (!this._externalLock) {
			return false; // 当前没有锁可释放
		}

		this._externalLock = false;
		this._externalLockHolder = null;

		// 通知等待队列中的下一个等待者
		if (this._externalLockQueue.length > 0) {
			const next = this._externalLockQueue.shift();
			this._externalLock = true;
			this._externalLockHolder = Date.now();
			next.resolve(true);
		}

		return true;
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
				ConnectionType.MIDDLE_ACCOUNT
			);
		}
		if (config.midip && config.midportm) {
			await this.createAndConnectClient(
				'middle',
				config.midip,
				config.midportm,
				ConnectionType.MIDDLE_MSG
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
						ConnectionType.JUDGE_DISC
					);
				}
				if (server.judgePort) {
					await this.createAndConnectClient(
						server.id,
						server.ip,
						server.judgePort,
						ConnectionType.JUDGE_SUBMIT
					);
				}
				if (server.queryPort) {
					await this.createAndConnectClient(
						server.id,
						server.ip,
						server.queryPort,
						ConnectionType.JUDGE_QUERY
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
		const key = `${type}_${serverId}_${port}`;
		if (this.clients.has(key)) return this.clients.get(key);

		const client = new PersistentJudgeClient(serverId, ip, port, type);
		this.clients.set(key, client);

		client.on(Events.CONNECTED, (clientKey) => {
			console.log(`Client ${clientKey} connected`);
		});

		client.on(Events.DISCONNECTED, (clientKey) => {
			//console.warn(`Client ${clientKey} disconnected`);
		});

		client.on(Events.ERROR, (error) => {
			//console.error(`Client ${key} error:`, error.message);
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
				if (client.state === ConnectionState.DISCONNECTED && client.autoConnect) {
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
	getClient(serverId, port, type) {
		const key = `${type}_${serverId}_${port}`;
		return this.clients.get(key);
	}

	/**
	 * 获取中间部分客户端
	 */
	getMiddleA() {
		return this.getClient('middle', config.midporta, ConnectionType.MIDDLE_ACCOUNT);
	}
	getMiddleM() {
		return this.getClient('middle', config.midportm, ConnectionType.MIDDLE_MSG);
	}

	/**
	 * 获取评测机客户端
	 */
	getJudgeClient(serverId, type) {
		const server = config.judgeServerMap[serverId];
		if (!server) throw new Error(`Judge server ${serverId} not found`);

		let port;
		switch (type) {
			case ConnectionType.JUDGE_DISC:
				port = server.discPort;
				break;
			case ConnectionType.JUDGE_SUBMIT:
				port = server.judgePort;
				break;
			case ConnectionType.JUDGE_QUERY:
				port = server.queryPort;
				break;
			default:
				throw new Error(`Unknown connection type: ${type}`);
		}

		return this.getClient(serverId, port, type);
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
		//return this.getJudgeClient(sellected.id, type);
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

	/**
	 * 获取所有连接状态
	 */
	getConnectionStatus() {
		const status = [];
		for (const [key, client] of this.clients.entries()) {
			status.push({
				key,
				ip: client.ip,
				port: client.port,
				type: client.type,
				state: client.getState(),
				serverId: client.serverId,
				connected: client.isConnected()
			});
		}
		return status;
	}
}
const connectionManager = new ConnectionManager();
async function initializeConnections() {
	await connectionManager.initialize();
}

/**
 * generate register info for a new account
 * @param {any} nam
 * @param {any} pas
 * @param {any} uid
 * @returns
 */
async function genreginfo(nam, pas, uid) {
	const client = connectionManager.getMiddleM();
	let response = "", token = "", code = "";
	try {
		if (!client || !client.isConnected()) throw new Error('Register server not connected');
		await client.sendOnly('A', nam);
		await client.sendOnly('A', pas);
		response = await client.sendAndWait('A', uid);
		const res = JSON.parse(response.content);
		if (res[0] !== 'Y') return `["N","${res[1]}"]`;
		token = res[1];
		response = await client.sendAndWait('E', token);
		code = response.content;
        return `["Y","${token}","${code}"]`;
	} catch (error) {
		console.error('Failed to generate register info:', error.message);
		return `["N","${error.message}"]`;
	}
}


async function verifycode(token, code) {
	const client = connectionManager.getMiddleM();
	try {
		if (!client || !client.isConnected()) throw new Error('Register server not connected');
		await client.sendOnly('V', token);
		const response = await client.sendAndWait('V', code);
		console.log(response);
        return response.content;
	} catch (error) {
		console.error('Failed to verify register code:', error.message);
		return "N";
	}
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
		const response = await client.sendAndWait('V', cookie);
		return response.content;
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
		await client.sendOnly('L', username);
		const response = await client.sendAndWait('L', password);
		return response.content;
	} catch (error) {
		console.error('Failed to login:', error.message);
		return error.message;
	}
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

/**
 * get account info(short, only contains username and public code setting)
 * @param {any} cookie
 * @returns {Array} ["Y"/"N",[username, publiccode]/error]
 */
async function getinfoshort(cookie) {
	const client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		//let response = await client.sendAndWait('V', cookie);
		//if (response.content === "N") return `["N","${response.content}"]`;
		let response = await client.sendAndWait('Q', cookie);
		return `["Y",${response.content}]`;
	} catch (error) {
		console.error('Failed to get account info:', error.message);
		return `["N","${error.message}"]`;
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
		let response = await client.sendAndWait('C', cookie);
		if (response.content === "N") return "N";
		await client.sendOnly('U', username);
		await client.sendOnly('P', password);
		response = await client.sendAndWait('C', publiccode);
		return response.content;
	} catch (error) {
		console.error('Failed to update account info:', error.message);
		return "N";
	}
}

function buildid(serverid, value) {
	const judgeIdHex = parseInt(serverid, 10).toString(16).padStart(2, '0');
	const submissionIdHex = parseInt(value, 10).toString(16).padStart(6, '0');
	return judgeIdHex.toUpperCase() + submissionIdHex.toUpperCase();
}

function parseid(fullId) {
	const serverid = parseInt(fullId.substring(0, 2), 16).toString(10);
	const value = parseInt(fullId.substring(2), 16);
	return { serverid, value };
}

/**
 * start a publicdiscussion
 * @param {any} cookie
 * @param {any} content
 * @param {any} title
 * @returns {Array} ["Y"/"N", cid/error]
 */
async function newdisc(cookie, content, title) {
	let client = connectionManager.getMiddleA();
	try {
		if (!client || !client.isConnected()) throw new Error('Account server not connected');
		const response = await client.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to creatediscussion(cookie err):', error.message);
		return `["N","${error.message}"]`;
	}
	//passed cookie check
	try {
		const server = connectionManager.selectJudgeServerId(ConnectionType.JUDGE_DISC);
		client = connectionManager.getJudgeClient(server, ConnectionType.JUDGE_DISC);
		if (!client || !client.isConnected()) throw new Error('Discussion server not connected');
		await client.sendOnly('S', content);
		await client.sendOnly('S', title);
		const uids = getuid(cookie);
		const response = await client.sendAndWait('S', uids);
		if (response.status === "Y") {
			const nid = buildid(server, response.content);
			client = connectionManager.getMiddleM();
			await client.sendOnly('N', nid);
			await client.sendOnly('N', title);
			await client.sendOnly('N', content);
			return `["Y","${nid}"]`;
		}
		throw "IDK?";
	}
	catch (error) {
		console.error('Failed to creatediscussion:', error.message);
		return `["N","${error.message}"]`;
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
		const response = await client.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to postdiscussion(cookie err):', error.message);
		return "N";
	}
	//passed cookie check
	try {
		const val = parseid(cid), uids = getuid(cookie);
		client = connectionManager.getJudgeClient(val.serverid, ConnectionType.JUDGE_DISC);
		if (!client || !client.isConnected()) throw new Error('Discussion server not connected');
		await client.sendOnly('P', val.value.toString(10));
		await client.sendOnly('P', content);
		const response = await client.sendAndWait('P', uids);
		if (response.content === "Y") return "Y";
		throw "IDK?";
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
		const response = await client.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to getdiscussion(cookie err):', error.message);
		return `["N","${error.message}"]`;
	}
	//passed cookie check
	try {
		const val = parseid(cid);
		client = connectionManager.getJudgeClient(val.serverid, ConnectionType.JUDGE_DISC);
		if (!client || !client.isConnected()) throw new Error('Discussion server not connected');
		await client.sendOnly('G', val.value.toString(10));
		const response = await client.sendAndWait('S', page);
		if (response.status === "Y") return `["Y",${response.content}]`;
		else throw new Error(response.content);
	}
	catch (error) {
		console.error('Failed to get discussion:', error.message);
		return `["N","${error.message}"]`;
	}
}

/**
 * 
 * @returns
 */
async function getdisclist() {
	let client = connectionManager.getMiddleM();
	try {
		const response = await client.sendAndWait('C', " ");
		return `["Y",${response.content}]`;
	}
	catch (error) {
		console.error('Failed to get discussion list:', error.message);
		return `["N","${error.message}"]`;
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
		console.error('Failed to submit(unsupported language):', error.message);
		return `["N","${error.message}"]`;
	}
	const client1 = connectionManager.getMiddleA();
	try {
		if (!client1 || !client1.isConnected()) throw new Error('Account server not connected');
		const response = await client1.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to submit(cookie err):', error.message);
		return `["N","${error.message}"]`;
	}
	//passed cookie check
	try {
		const server = connectionManager.selectJudgeServerId(ConnectionType.JUDGE_SUBMIT);
		const client = connectionManager.getJudgeClient(server, ConnectionType.JUDGE_SUBMIT);
		if (!client || !client.isConnected()) throw new Error('Judge server not connected');
		const uids = getuid(cookie);
		let response = await client.sendAndWait('S', uids);
		if (response.status === "E") return `["N","${response.content}"]`;
		response = await client.sendAndWait('O', pid);
		if (response.status === "E") return `["N","${response.content}"]`;
		await client.sendOnly('O', lan);
		response = await client.sendAndWait('O', code);
		if (response.status !== "O") throw response.content;
		const nid = buildid(server, response.content);
		await client1.sendOnly('R', uids);
		await client1.sendAndWait('R', nid);
		return `["Y","${nid}"]`;
	}
	catch (error) {
		console.error('Failed to submit:', error.message);
		return `["N","${error.message}"]`;
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
		const response = await client1.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to get record(cookie err):', error.message);
		return `["N","${error.message}"]`;
	}
	//passed cookie check
	try {
		const val = parseid(rid);
		const client = connectionManager.getJudgeClient(val.serverid, ConnectionType.JUDGE_QUERY);
		if (!client || !client.isConnected()) throw new Error('Judge server not connected');
		let response = await client.sendAndWait('R', val.value.toString(10));
		if (response.status === "E") {
			//throw new Error('not finished');
			//just informs that this record file doesn't currently exists
			//try to fetch short result instead
			response = await client.sendAndWait('Q', val.value.toString(10));
			const res = JSON.parse(response.content)
			if (res.pts < 0) throw new Error('Bad record ID');
			else return `["P",${response.content}]`;
		}
		const reslt = response.content;
		const uid = JSON.parse(reslt).uid.toString();
		await client1.sendOnly('A', cookie);
		response = await client1.sendAndWait('A', uid);
		if (response.status !== "O") {
			const obj = ["Y", reslt, "//You're not allowed to view this code!!!"];
			return JSON.stringify(obj, null, 2);
		}
		response = await client.sendAndWait('C', val.value.toString(10));
		const obj = ["Y", reslt, response.content];
		return JSON.stringify(obj, null, 2);
	}
	catch (error) {
		console.error('Failed to get record:', error.message);
		return `["N","${error.message}"]`;
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
		let response = await client1.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
		const uids = getuid(cookie);
		await client1.sendOnly('G', uids);
		response = await client1.sendAndWait('G', page);
		if (response.status === "O") return `["Y",${response.content}]`;
		else return `["N","${response.content}"]`;
	} catch (error) {
		console.error('Failed to get record:', error.message);
		return `["N","${error.message}"]`;
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
		let response = await client1.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
		const uids = getuid(cookie);
		await client.sendOnly('R', uids);
		await client.sendOnly('R', content);
		response = await client.sendAndWait('R', target);
		if (response.status === "O") return "Y";
		else return "N";
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
		let response = await client1.sendAndWait('V', cookie);
		if (response.content !== "Y") throw "IDK?";
		const uids = getuid(cookie);
		await client.sendOnly('G', uids);
		response = await client.sendAndWait('G', page);
		if (response.status === "O") return `["Y",${response.content}]`;
		else return `["N","${response.content}"]`;
	}
	catch (error) {
		console.error('Failed to get post message:', error.message);
		return `["N","${error.message}"]`;
	}
}

async function updproblemlist() {
	const server = connectionManager.selectJudgeServerId(ConnectionType.JUDGE_SUBMIT);
	const client = connectionManager.getJudgeClient(server, ConnectionType.JUDGE_SUBMIT);
	try {
		if (!client || !client.isConnected()) throw new Error('Problem server not connected');
		const ret = await client.sendAndWait('V', config.verinfo);
		return ret.content;
	}
	catch (error) {
		console.error('Failed to update problem list:', error.message);
		return "[]";
	}
}

module.exports = {
	PersistentJudgeClient,
	ConnectionManager,
	ConnectionState,
	ConnectionType,
	Events,
	connectionManager,
	initializeConnections,

	//API functions
	//register
	genreginfo,
	verifycode,

	//account
	verify_cookie,
	login,
	getinfoshort,
	updinfo,

	//disc
	newdisc,
	postdisc,
	getdisc,
	getdisclist,

	//submit
	submit,

	//record(list)
	getrecord,
	getrecordlist,

	//message
	postmsg,
	getmsg,

	//problem list
	updproblemlist,

	//meaningless(?) preserved
	getJudgeServerConfig: (judgeId) => {
		const server = config.judgeServerMap[judgeId];
		if (!server) {
			throw new Error(`Judge server ${judgeId} not found`);
		}
		return server;
	},
	JudgeClient: PersistentJudgeClient
};