const fs = require('fs');
const path = require('path');

let curdir = __dirname;
let pat = path.join(curdir, 'config.json');
let problempath = path.join(curdir, 'problem');
const isBun = typeof Bun !== 'undefined';
if (isBun) {
    curdir = path.resolve("./");
    pat = path.join(curdir, 'config.json');
    problempath = path.join(curdir, 'problem');
}

const data = fs.readFileSync(pat);
const pardata = JSON.parse(data);
const port = pardata.port;
const midport = pardata.midport;
const midporta = pardata.midporta;
const midportm = pardata.midportm;
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
    midporta,
    midportm,
    judgeServers,
    judgeServerMap,
    problempath,
    verinfo: "7.41.114",

    SN_IQ: 'I', // in queue
    SN_CJ: 'J', // currently judging
    SN_AC: 'A', // accepted
    SN_RJ: 'B', // rejected(ban)
    SN_CE: 'C', // compile error
    SN_TE: 'T', // time limit exceeded
    SN_ME: 'M', // memory limit exceeded
    SN_RE: 'R', // runtime error
    SN_WA: 'W', // wrong answer
    SN_SE: 'S', // acceptable system error
    SN_SCE: 'E', // system critical error
    JS_IQ: 202,
    JS_CJ: 206,
    JS_AC: 200,
    JS_RJ: 403,
    JS_CE: 400,
    JS_TE: 408,
    JS_ME: 413,
    JS_RE: 502,
    JS_WA: 406,
    JS_SE: 500
};