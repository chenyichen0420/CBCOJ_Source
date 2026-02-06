Currently, all sources are just "frontend" sources, providing basic API services.

Bellow is the format of all APIs supported:

## Registeration(Unsupported)

### Generate Register Token
```
GET /genregtoken
  usrname (string) - Username
  paswd (string) - Password
Returns:
  ["Y",token] - Success, returns register token.
  ["N",error] - Failure, returns error message.
Warning:
  All token will be disabled every 5 min.
  Eg. If you get an register token at 12:54:59, then it will be disabled in 1 second.
```

### Verify Activate Code
```
GET /verifycode
  token (string) - Register Token
  code (string) - Register Code
Returns:
  "Y" - Success
  "N" - Failure
Warning:
  Once failed, the token will be unavailable to register.
```

## Authentication

### Verify Cookie
```
GET /verifycookie
Parameters:
  cookie (string) - Cookie value
Returns:
  "Y" - Valid
  "N" - Invalid
```

### Login
```
GET /login
Parameters:
  usrname (string) - Username
  paswd (string) - Password
Returns:
  ["Y", cookie] - Success, returns Cookie
  ["N", error] - Failure, returns error message
```

### Get Short User Information
```
GET /getinfoshort
Parameters:
  key (string) - Key value, uid, username or cookie.
Returns:
  ["Y", [uid, username, publiccode]] - Success
  ["N", error] - Failure
```

### Update User Information
```
GET /updinfo
Parameters:
  cookie (string) - Cookie value
  usrname (string) - Username
  paswd (string) - Password
  pubcode (string) - Public code
Returns:
  "Y" - Success
  "N" - Failure
```

## Discussion Management

### Create New Discussion
```
GET /newdisc
Parameters:
  cookie (string) - Cookie value
  content (string) - Initial content
Returns:
  ["Y", cid] - Success, returns discussion ID
  ["N", error] - Failure, returns error message
```

### Post Discussion Message
```
GET /postdisc
Parameters:
  cookie (string) - Cookie value
  content (string) - Discussion content
  cid (string) - Discussion ID
Returns:
  "Y" - Success
  "N" - Failure
```

### Get Discussion History
```
GET /getdisc
Parameters:
  cookie (string) - Cookie value
  cid (string) - Discussion ID
  page (num) - Page number
Returns:
  ["Y", [{"uid": num, "msg": string}, ...], discussion page count] - Success, returns Discussion list and total discussion pages. The first element is the title and author of this Discussion
  ["N", error] - Failure, returns error message
```

### Get Recent Discussion List
```
GET /getdisclist
Parameters:
	nothing
Returns:
	["Y", [cid list]] - Success, returns a list of cid list
	["N", error] - Failure, returns error message
```

## Record Management

### Get Record Detail
```
GET /record
Parameters:
  cookie (string) - Cookie value
  rid (string) - Record ID
Returns:
  ["N", error] - Failure, returns error message.
  ["P", JSON result] - Success, but the judger haven't finished judging, returns a simple report.
  ["Y", JSON result, Text code] - Success, the judger have finished judging, returns a detailed report and source code.
```

### Get Record List
```
GET /recordlist
Parameters:
  cookie (string) - Cookie value
  target (string) - Target user/filter condition
  page (num) - Page number
Returns:
  ["Y", [rid list], record page count] - Success, returns Record ID list and total record pages
  ["N", error] - Failure, returns error message
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
  ["Y", rid] - Success, returns Record ID
  ["N", error] - Failure, returns error message
```

## Messaging

### Send Message
```
GET /postmsg
Parameters:
  cookie (string) - Cookie value
  target (string) - Target user
  content (string) - Message content
Returns:
  "Y" - Success
  "N" - Failure
```

### Get Message
```
GET /getmsg
Parameters:
  cookie (string) - Cookie value
  page (num) - Page number
Returns:
  ["Y", [{"uid": num, "msg": string}, ...], message page count] - Success, returns Message list and total message pages
  ["N", error] - Failure, returns error message
```

## Problem

### Get Problem
```
GET /getproblem
Parameters:
  pid (string) - Problem ID
Returns:
  JSON(fully user-defined value)
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
        "output":string
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
  ["Y",[pid list],problem count] - Success, returns Pid list and total problem count.
  ["N",error msg] - Failure, returns error message.
```

---

**Notes:**
1. All parameters are required
2. When return value is an array, the first element indicates success/failure status
3. All endpoints require a valid Cookie value (except /login)
4. Page numbers start from 1
5. If there's a conflict with the source code, refer to the code.
6. Result value mapping chart:
  ```
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
