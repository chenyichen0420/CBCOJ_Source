Currently, all sources are just "frontend" sources, providing basic API services.

Bellow is the format of all APIs supported:

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

### User Login
```
GET /login
Parameters:
  usrname (string) - Username
  paswd (string) - Password
Returns:
  ["Y", cookie] - Success, returns Cookie
  ["N", error] - Failure, returns error message
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
  JSON - Chat history data
```

## Record Management

### Get Record Details
```
GET /record
Parameters:
  cookie (string) - Cookie value
  rid (string) - Record ID
Returns:
  JSON - Record details data
```

### Get Record List
```
GET /recordlist
Parameters:
  cookie (string) - Cookie value
  target (string) - Target user/filter condition
  page (num) - Page number
Returns:
  JSON - Record list data
```

## Submission

### Submit Code
```
POST /submit
Parameters:
  cookie (string) - Cookie value
  pid (string) - Problem ID
  lan (string) - Programming language
Request Body:
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

### Get Messages
```
GET /getmsg
Parameters:
  cookie (string) - Cookie value
  page (num) - Page number
Returns:
  JSON - Message list data
```

---

**Notes:**
1. All parameters are required
2. When return value is an array, the first element indicates success/failure status
3. All endpoints require a valid Cookie value (except /login)
4. Page numbers start from 1
5. If there's a conflict with the source code, refer to the code.
