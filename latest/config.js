const fs = require('fs');
const path = require('path');

let curdir = __dirname;
let pat = path.join(curdir, 'config.json');
let rootDir = path.join(curdir, 'public/');
const isBun = typeof Bun !== 'undefined';
if (isBun) {
    curdir = path.resolve("./");
    pat = path.join(curdir, 'config.json');
    rootDir = path.join(curdir, 'public');
}

const data = fs.readFileSync(pat);
const pardata = JSON.parse(data);
const port = pardata.port;
const midport = pardata.midport;
const midip = pardata.midip;

const judgeServers = pardata.judger || [];
const judgeServerMap = {};
judgeServers.forEach(server => {
    judgeServerMap[server.id] = server;
});

module.exports = {
    port,
    midip,
    midport,
    judgeServers,
    judgeServerMap,
    maxRetries: 3,
    retryDelay: 30,
    verinfo: "7.37.110"
};