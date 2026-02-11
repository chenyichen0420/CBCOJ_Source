We're trying to shift the API server from javascript(node.js) to MSVC c++20, all API disabled.

Most API will have a new format due to "technical" reason(I'm too lazy to implement many types of response).

## Account Management

### Verify Cookie
```
GET /verifycookie
Parameters:
	cookie (string) - Cookie value
Returns:
	Success:
		{
			"status": "Y"
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

### Login
```
GET /login
Parameters:
	usrname (string) - Username
	paswd (string) - Password
Returns:
	Success:
		{
			"status": "Y",
			"cookie": string
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

### Get Short User Information
```
GET /getinfoshort
Parameters:
	key (string) - Key value, uid, username or cookie.
Returns:
	Success:
		{
			"status":"Y",
			"uid": num,
			"username": string,
			"publiccode": bool,
			"slogan": string
		}
	Fail:
		{
			"status": "N",
			"error": String
		}
```

### Update User Information
```
POST /updinfo
Body:
	cookie (string) - Cookie value
	usrname (string) - Username
	paswd (string) - Password
	pubcode (string) - Public code
	slogan (string) - Slogan
Returns:
	Success:
		{
			"status": "Y"
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

## Discussion Management

### Create New Discussion
```
POST /newdisc
body:
	cookie (string) - Cookie value
	content (string) - Initial content
Returns:
	Success:
		{
			"status": "Y",
			"cid": string
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

### Post Discussion Message
```
POST /postdisc
Body:
	cookie (string) - Cookie value
	content (string) - Discussion content
	cid (string) - Discussion ID
Returns:
	Success:
		{
			"status": "Y"
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

### Get Discussion History
```
GET /getdisc
Parameters:
	cookie (string) - Cookie value
	cid (string) - Discussion ID
	page (num) - Page number
Returns:
	Success:
		{
			"status": "Y",
			"msglist": [
				{
					"uid":num,
					"msg":string
				},
				....
			],
			"page": num
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

### Get Recent Discussion List
```
GET /getdisclist
Parameters:
	nothing
Returns:
	Success:
		{
			"status": "Y",
			"cidlist": [string list]
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

## Record Management

### Get Record Detail
```
GET /record
Parameters:
	cookie (string) - Cookie value
	rid (string) - Record ID
Returns:
	Fail:
		{
			"status": "N",
			"error": string
		}
	Success(judge mission unfinished):
		{
			"status": "P",
			"result": JSON
		}
	Success(judge mission finished):
		{
			"status": "Y",
			"result": JSON,
			"code": string
		}
```

### Get Record List
```
GET /recordlist
Parameters:
	cookie (string) - Cookie value
	target (string) - Target user/filter condition
	page (num) - Page number
Returns:
	Success:
		{
			"status": "Y",
			"ridlist": [string list],
			"page": num
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

## Submission

### Submit Code
```
POST /submit
Request Body:
	cookie (string) - Cookie value
	pid (string) - Problem ID
	lan (string) - Programming language
	code (string) - Code content
Returns:
	Success:
		{
			"status": "Y",
			"rid": string
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

## Messaging

### Send Message
```
POST /postmsg
Body:
	cookie (string) - Cookie value
	target (string) - Target user
	content (string) - Message content
Returns:
	Success:
		{
			"status": "Y"
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

### Get Message
```
GET /getmsg
Parameters:
	cookie (string) - Cookie value
	page (num) - Page number
Returns:
	Success:
		{
			"status": "Y",
			"msglist": [
				{
					"uid":num,
					"msg":string
				},
				....
			],
			"page": num
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

## Problem

### Get Problem
```
GET /getproblem
Parameters:
	pid (string) - Problem ID
Returns:
	JSON (fully user-defined value)
	*** Webpage recognizes following structure:
	{
		"title":string,
		"background":string,
		"description":string,
		"inputfmt":string,
		"outputfmt":string,
		"sample":[
			{
			"input": string,
			"output": string
			},
			...
		],
		"hint":string,
		"timelm":num,
		"memlm":num
	}
	note that "timelm" stands for time limit in ms, "memlm" stands for memory limit in MiB.
```

### Get Problem List
```
GET /getproblemlist
Parameters:
	page (num) - Page number
Returns:
	Success:
		{
			"status": "Y",
			"pidlist": [string list],
			"count": num
		}
	Fail:
		{
			"status": "N",
			"error": string
		}
```

## Registeration(Will be disabled for a long time, not under maintainance)

### Generate Register Token
```
GET /genregtoken
	usrname (string) - Username
	paswd (string) - Password
	uid (num) - Luogu user id
Returns:
	["Y",token] - Success, returns register token.
	["N",error] - Failure, returns error message.
Warning:
	A message will be sent to the uid you insert in /genregtoken automatically, including the Register code.
	Token will be disabled after 10 min.
	Eg. If you get an register token at 12:54:59, then it will be disabled at 13:04:59.
```

### Verify Activate Code
```
GET /verifycode
	token (string) - Register Token
	code (string) - Register Code
Returns:
	"Y" - Success
	"N" - Failure
```

---

**Notes:**
1. All parameters are required
2. When return value is an array, the first element indicates success/failure status
3. All endpoints require a valid Cookie value (except /login)
4. Page numbers start from 1
5. If there's a conflict with the source code, refer to the code.
6. Result value mapping chart:
	```cpp
	constexpr int
		JS_IQ = 202,
		JS_CJ = 206,
		JS_AC = 200,
		JS_RJ = 403,
		JS_NE = 404,
		JS_CE = 400,
		JS_TE = 408,
		JS_ME = 413,
		JS_RE = 502,
		JS_WA = 406,
		JS_SE = 500;
	constexpr char
		SN_IQ = 'I', //in queue
		SN_CJ = 'J', //currently judging
		SN_AC = 'A', //accepted
		SN_RJ = 'B', //rejected(ban/ignored)
		SN_NE = 'N', //Problem DNE
		SN_CE = 'C', //compile error
		SN_TE = 'T', //time limit exceeded
		SN_ME = 'M', //memory limit exceeded
		SN_RE = 'R', //runtime error
		SN_WA = 'W', //wrong answer
		SN_SE = 'S', //acceptable system error
		SN_SCE = 'E'; //system critical error
	```
