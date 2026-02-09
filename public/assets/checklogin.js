const BASE_URL = 'http://10.168.43.28:1949';
function getcookie() {
    return document.cookie.split('; ').find(row => row.startsWith('user_cookie='))?.split('=')[1] || "gunmu";
}
async function getusername(uid) {
    const userInfoResponse = await fetch(BASE_URL + '/api/getinfoshort?key=' + uid);
    const userInfo = await userInfoResponse.json();
    return userInfo[1][1] || 'Invalided username';
}
async function getuid(username) {
    const userInfoResponse = await fetch(BASE_URL + '/api/getinfoshort?key=' + username);
    const userInfo = await userInfoResponse.json();
    return userInfo[1][0] || -1;
}
async function checkLogin() {
    const cookie = getcookie();
    const loginArea = document.getElementById('login-area');
    const statusIndicator = document.getElementById('statusIndicator');
    if (!cookie || cookie === "gunmu") {
        loginArea.innerHTML = '<button class="login-btn" onclick="window.location.href=\'login\'">登录</button>';
        document.getElementById('statusText').textContent = '未登录';
        statusIndicator.className = 'status-indicator logged-out';
        return;
    }
    try {
        const response = await fetch(BASE_URL + '/api/verifycookie?cookie=' + encodeURIComponent(cookie));
        const result = await response.text();
        if (result === 'Y') {
            let username;
            try {
                const userInfoResponse = await fetch(BASE_URL + '/api/getinfoshort?key=' + encodeURIComponent(cookie));
                const userInfo = await userInfoResponse.json();
                username = userInfo[1][1];
            } catch (e) {
                console.error(e);
                let len = parseInt(cookie[0], 10);
                username = `UID : ${cookie.substring(1, 1 + len)}`;
            }
            loginArea.innerHTML = `<div class="logged-in">欢迎，${username}</div>`;
            document.getElementById('statusText').textContent = '已登录';
            document.getElementById('login-status').innerHTML = '<div class="status-indicator" id="statusIndicator"><div class="status-indicator logged-in" id="statusIndicator"></div></div><span id="statusText">已登录</span><div class="logout-popup"><button onclick="logout()">登出</button></div>'
            document.getElementById('login-status').className = 'logged-in';
            statusIndicator.className = 'status-indicator logged-in';
        } else {
            loginArea.innerHTML = '<button class="login-btn" onclick="window.location.href=\'login\'">登录</button>';
            document.getElementById('statusText').textContent = '登录失效';
            statusIndicator.className = 'status-indicator logged-out';
        }
    } catch (error) {
        loginArea.innerHTML = '<button class="login-btn" onclick="window.location.href=\'login\'">登录</button>';
        document.getElementById('statusText').textContent = '检查登录状态失败';
        statusIndicator.className = 'status-indicator logged-out';
        console.error('Error during login check:', error);
    }
}
function logout() {
    document.cookie = 'user_cookie=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    location.reload();
}