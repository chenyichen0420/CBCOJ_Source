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
	JUDGE_CHAT: 'judge_chat',
	JUDGE_SUBMIT: 'judge_submit',
	JUDGE_QUERY: 'judge_query',
	MIDDLE: 'middle'
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

				if (status === 'E') {
					callback.reject(new Error(content));
				} else {
					// 返回包含 status 和 content 的对象
					callback.resolve({ status, content });
				}
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
		if (config.midip && config.midport) {
			await this.createAndConnectClient(
				'middle',
				config.midip,
				config.midport,
				ConnectionType.MIDDLE
			);
		}

		// 连接所有评测机
		if (config.judgeServers && config.judgeServers.length > 0) {
			for (const server of config.judgeServers) {
				if (server.chatPort) {
					await this.createAndConnectClient(
						server.id,
						server.ip,
						server.chatPort,
						ConnectionType.JUDGE_CHAT
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
	getMiddleClient() {
		return this.getClient('middle', config.midport, ConnectionType.MIDDLE);
	}

	/**
	 * 获取评测机客户端
	 */
	getJudgeClient(serverId, type) {
		const server = config.judgeServerMap[serverId];
		if (!server) throw new Error(`Judge server ${serverId} not found`);

		let port;
		switch (type) {
			case ConnectionType.JUDGE_CHAT:
				port = server.chatPort;
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
	selectJudgeServer(type) {
		const availableServers = config.judgeServers.filter(server => {
			const client = this.getJudgeClient(server.id, type);
			return client && client.isConnected();
		});

		if (availableServers.length === 0) {
			return null;
		}

		const randomIndex = Math.floor(Math.random() * availableServers.length);
		const sellected = availableServers[randomIndex];

		return this.getJudgeClient(sellected.id, type);
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

/**
 * 初始化连接
 */
async function initializeConnections() {
	await connectionManager.initialize();
}

/**
 * 验证cookie有效性（使用中间部分）
 */
async function verify_cookie(cookie) {
	const client = connectionManager.getMiddleClient();
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}

		const response = await client.sendAndWait('V', cookie);
		return response.content;
	} catch (error) {
		console.error('Failed to verify cookie:', error.message);
		return "N";
	}
}

/**
 * 登录到评测机
 */
async function login(username, password) {
	const client = connectionManager.getMiddleClient();
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		await client.sendOnly('L', username);
		const response = await client.sendAndWait('L', password);
		return response.content;
	} catch (error) {
		console.error('Failed to login:', error.message);
		return error.message;
	}
}

/**
 * 修改账号设置
 */

async function updinfo(cookie, username, password, publiccode) {
	const client = connectionManager.getMiddleClient();
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		let response = await client.sendAndWait('C', cookie);
		if (response.content === "N") return "N";
		client.sendOnly('U', username);
		client.sendOnly('P', password);
		response = client.sendAndWait('C', publiccode);
		return response;
	} catch (error) {
		console.error('Failed to update account info:', error.message);
		return error.message;
	}
}

/**
 * 新建讨论
 */

async function newchat(cookie, content) {
	let client = connectionManager.getMiddleClient();
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		const response = await client.sendAndWait('V', cookie);
		if (response.content != "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to create chat(cookie err):', error.message);
		return `["N",${error.message}]`;
	}
	//passed cookie check
	client = connectionManager.selectJudgeServer(ConnectionType.JUDGE_CHAT);
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		const response = await client.sendAndWait('S', content);
		if (response.status === "Y") return `["Y",${response.content}]`;
		throw "IDK?";
	}
	catch (error) {
		console.error('Failed to create chat:', error.message);
		return `["N",${error.message}]`;
	}
}

/**
 * 回复讨论
 */

async function postchat(cookie, cid, content) {
	let client = connectionManager.getMiddleClient();
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		const response = await client.sendAndWait('V', cookie);
		if (response.content != "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to post chat(cookie err):', error.message);
		return "N";
	}
	//passed cookie check
	client = connectionManager.selectJudgeServer(ConnectionType.JUDGE_CHAT);
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		client.sendOnly('P', cid);
		const response = await client.sendAndWait('S', content);
		console.log(response)
		if (response.content === "Y") return "Y";
		console.log("alive")
		throw "IDK?";
	}
	catch (error) {
		console.error('Failed to post chat:', error.message);
		return "N";
	}
}

/**
 * 获取讨论
 */

async function getchat(cookie, cid, page) {
	let client = connectionManager.getMiddleClient();
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		const response = await client.sendAndWait('V', cookie);
		if (response.content != "Y") throw "IDK?";
	} catch (error) {
		console.error('Failed to get chat(cookie err):', error.message);
		return `["N",${error.message}]`;
	}
	//passed cookie check
	client = connectionManager.selectJudgeServer(ConnectionType.JUDGE_CHAT);
	try {
		if (!client || !client.isConnected()) {
			throw new Error('Middle server not connected');
		}
		client.sendOnly('G', cid);
		const response = await client.sendAndWait('S', page);
		if (response.status === "Y") return `["Y",${response.content}]`;
		throw "IDK?";
	}
	catch (error) {
		console.error('Failed to get chat:', error.message);
		return `["N",${error.message}]`;
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

	// API函数
	//account
	verify_cookie,
	login,
	updinfo,

	//chat
	newchat,
	postchat,
	getchat,

	getJudgeServerConfig: (judgeId) => {
		const server = config.judgeServerMap[judgeId];
		if (!server) {
			throw new Error(`Judge server ${judgeId} not found`);
		}
		return server;
	},
	JudgeClient: PersistentJudgeClient
};