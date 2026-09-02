# Access Control Model of CBCOJ Linux Judger

This document describes the access control model implemented in the CBCOJ judger for Linux kernel 3.5+.

---

## 1. Introduction

In online judge (OJ) systems, executing untrusted user-submitted code securely is a fundamental requirement. The evaluation process must prevent malicious programs from damaging the host system, accessing unauthorized resources, or exfiltrating sensitive data. On Linux platforms, common sandboxing approaches include chroot jails, seccomp-bpf, cgroups, namespaces, and Linux Security Modules (LSM).

This document describes a **three-layer defense-in-depth** access control model built upon:

- **chroot jail** – for file system namespace isolation.
- **seccomp-bpf system call whitelisting** – for restricting available kernel interfaces.
- **setrlimit resource limits** – for CPU time, memory, and file size constraints.

The model has been validated on Linux kernel 3.5+ with seccomp support, and is suitable for OJ systems or general-purpose secure execution frameworks.

---

## 2. Design Objectives

The access control model aims to achieve the following goals:

| Objective | Description |
|-----------|-------------|
| **File system isolation** | Confine the process to a restricted directory tree via chroot; prevent access to host system files. |
| **System call restriction** | Allow only a minimal whitelist of system calls; kill any process attempting disallowed syscalls. |
| **Resource limits** | Enforce CPU time, virtual memory, and file size limits to prevent resource exhaustion. |
| **Clean process termination** | Parent process monitors and terminates the child when limits are exceeded. |

---

## 3. Architecture Overview

The model consists of three independent protection layers, each enforcing a distinct security boundary:

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: chroot Jail                                         │
│  - Restrict root directory to the evaluation working directory │
│  - Effect: Subprocess cannot access files outside the jail    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: seccomp-bpf System Call Whitelisting                │
│  - Allow only a pre-approved list of syscalls                 │
│  - Effect: Fork, socket, mount, chroot, etc. are killed       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: setrlimit Resource Limits                           │
│  - RLIMIT_CPU, RLIMIT_AS, RLIMIT_FSIZE                       │
│  - Effect: CPU time, memory, and file size are capped         │
└─────────────────────────────────────────────────────────────────┘
```

Each layer operates independently. Even if one layer is somehow bypassed, the others continue to provide protection.

---

## 4. Layer 1: chroot Jail

### 4.1 Core Mechanism

The `chroot()` system call changes the root directory of the calling process to a specified path. Once chrooted, the process cannot access any files outside this new root, as all path resolutions are relative to the jail root.

**Implementation flow:**
1. The parent process forks a child.
2. The child calls `chroot(path)` to set the jail root to the evaluation working directory.
3. The child then calls `chdir("/")` to move to the new root.
4. All subsequent file operations are confined to the jail.

### 4.2 Key Constants and Structures

| Name | Description |
|------|-------------|
| `chroot` | System call to change the root directory |
| `chdir` | System call to change the current working directory |
| `path` | Evaluation working directory path (the jail root) |

### 4.3 Key API Functions

| Function | Purpose |
|----------|---------|
| `fork` | Create a child process for isolation |
| `chroot` | Restrict root directory to the jail path |
| `chdir` | Change working directory to the new root |
| `execl` | Execute the evaluated program inside the jail |

### 4.4 Effect

- The child process **cannot** access files outside the evaluation working directory.
- System files (`/etc`, `/usr`, `/bin`, etc.) are **inaccessible** to the evaluated program.
- The program can only read input files and write output files within the jail.

---

## 5. Layer 2: seccomp-bpf System Call Whitelisting

### 5.1 Why seccomp?

Seccomp (Secure Computing Mode) allows a process to restrict the system calls it can make. Without seccomp, a malicious program could:
- Fork bomb the system (`fork`, `clone`).
- Create network sockets (`socket`, `connect`) to exfiltrate data.
- Modify the system (`mount`, `reboot`, `chroot`).
- Create new processes (`execve`, `execveat`).

The model uses **libseccomp** to install a **system call whitelist**, allowing only the minimal set required for normal program execution.

### 5.2 The System Call Whitelist

| Category | Allowed Syscalls |
|----------|------------------|
| **File operations** | `stat`, `lstat`, `newfstatat`, `openat`, `read`, `write`, `lseek`, `readlink`, `readlinkat`, `access` |
| **Memory management** | `brk`, `mmap`, `munmap`, `mprotect` |
| **Process management** | `exit`, `exit_group`, `execve`, `execveat` |
| **Signal handling** | `rt_sigprocmask`, `rt_sigaction`, `rt_sigreturn`, `sigaltstack` |
| **Time / random** | `clock_gettime`, `clock_getres`, `gettimeofday`, `getrandom` |
| **File descriptors** | `dup`, `dup2`, `dup3`, `fstat`, `futex` |
| **Other basic** | `getpid`, `getppid`, `uname`, `getrlimit`, `prlimit64` |

**Syscalls that are explicitly killed include but are not limited to:**

| Disallowed Syscall | Rationale |
|-------------------|-----------|
| `fork` | Prevent process creation |
| `vfork` | Prevent process creation |
| `clone` | Prevent thread/process creation |
| `socket` | Prevent network access |
| `socketpair` | Prevent network access |
| `pipe` / `pipe2` | Prevent IPC creation |
| `chdir` / `fchdir` | Prevent directory escape |
| `chroot` / `pivot_root` | Prevent jail escape |
| `mount` / `umount` / `umount2` | Prevent file system modification |
| `ptrace` | Prevent debugging |
| `setuid` / `setgid` / `capset` | Prevent privilege escalation |
| `reboot` | Prevent system shutdown |
| `msgget` / `shmget` / `semget` | Prevent inter-process communication |

### 5.3 Key Constants and Structures

| Name | Description |
|------|-------------|
| `scmp_filter_ctx` | libseccomp filter context |
| `SCMP_ACT_ALLOW` | seccomp action: allow the syscall |
| `SCMP_ACT_KILL` | seccomp action: kill the process |
| `SCMP_SYS(name)` | Macro to specify a system call by name |

### 5.4 Key API Functions

| Function | Purpose |
|----------|---------|
| `seccomp_init` | Initialize a seccomp filter context (default action: `SCMP_ACT_KILL`) |
| `seccomp_rule_add` | Add a rule to allow a specific syscall |
| `seccomp_load` | Load the filter into the kernel |
| `seccomp_release` | Release the filter context |

### 5.5 Effect

- The child process **cannot** create additional processes (`fork`, `clone`, `vfork`).
- The child process **cannot** establish network connections (`socket`, `connect`).
- The child process **cannot** escape the jail (`chroot`, `pivot_root`, `mount`).
- The child process **cannot** escalate privileges (`setuid`, `setgid`, `capset`).
- The child process **can** perform basic file I/O, memory allocation, and normal program execution.

---

## 6. Layer 3: setrlimit Resource Limits

### 6.1 Core Mechanism

`setrlimit()` sets resource limits on the calling process. The model applies three limits before executing the evaluated program.

### 6.2 Resource Limits

| Limit | Macro | Value |
|-------|-------|-------|
| **Virtual memory (address space)** | `RLIMIT_AS` | `meml * 1024 * 1024` (configurable memory limit in bytes) |
| **File size (output)** | `RLIMIT_FSIZE` | 256 MiB (prevents unlimited output files) |
| **CPU time** | `RLIMIT_CPU` | `(timl + 2999) / 1000` (configurable CPU time limit in seconds) |

**Note:** The CPU time limit is specified in **seconds** (`timl` is in milliseconds, so it is rounded up to the nearest second).

### 6.3 Key Constants and Structures

| Name | Description |
|------|-------------|
| `RLIMIT_AS` | Address space (virtual memory) limit |
| `RLIMIT_FSIZE` | Maximum file size that can be created |
| `RLIMIT_CPU` | CPU time limit in seconds |
| `struct rlimit` | Structure containing `rlim_cur` (soft limit) and `rlim_max` (hard limit) |

### 6.4 Key API Functions

| Function | Purpose |
|----------|---------|
| `setrlimit` | Set resource limits for the current process |
| `getrlimit` | Get current resource limits |
| `sysconf(_SC_CLK_TCK)` | Get system ticks per second for CPU time calculation |

### 6.5 Effect

- The process is **terminated** if it exceeds the memory limit.
- The process is **terminated** if it exceeds the CPU time limit.
- The process **cannot** write more than 256 MiB of data.
- Resource exhaustion attacks (fork bombs, memory bombs, infinite loops) are prevented.

---

## 7. Integration and Interaction

### 7.1 Prerequisites

The evaluating process must run with sufficient privileges:

| Requirement | Reason |
|-------------|--------|
| **Root privileges** | `chroot` requires `CAP_SYS_CHROOT` capability. The main program automatically re-executes itself with `sudo` if not running as root. |
| **libseccomp** | The seccomp filter requires the `libseccomp-dev` package. |
| **Linux kernel 3.5+** | Seccomp-bpf support is required (kernel 3.5+; full support in 3.19+). |

### 7.2 Synchronization Pipe

A synchronization pipe (`pipe2` with `O_CLOEXEC`) is used to ensure the parent process only starts monitoring after the child has successfully executed `execve`. This prevents race conditions where the parent might read process statistics before the child is fully initialized.

**Flow:**
1. Parent creates a pipe.
2. Child closes the read end.
3. Child calls `execve`.
4. If `execve` succeeds, the pipe is automatically closed (due to `O_CLOEXEC`).
5. Parent's `read()` on the pipe returns EOF, indicating the child is ready.
6. Parent begins monitoring CPU and memory usage.

### 7.3 Process Monitoring

The parent process monitors the child by:

1. Reading `/proc/[pid]/stat` to track CPU time.
2. Reading `/proc/[pid]/status` to track peak virtual memory (`VmPeak`).
3. Terminating the child if limits are exceeded.
4. Reaping the child with `waitpid`.

### 7.4 Exit Code Handling

The model distinguishes between:
- **Normal exit**: The program terminated cleanly with exit code 0.
- **Time limit exceeded**: CPU time > limit.
- **Memory limit exceeded**: Peak memory > limit.
- **Runtime error**: Abnormal exit (crash, signal, etc.).
- **System error**: chroot or seccomp setup failed.

---

## 8. Known Limitations and Risk Assessment

| Limitation | Risk Level | Mitigation |
|------------|------------|------------|
| **chroot escape via /proc** – `/proc` may still be accessible inside the jail | Medium | seccomp restricts `openat` and other proc-related syscalls; consider mounting a minimal `/proc` or using `pivot_root`. |
| **Privilege requirements** – program must run as root | Medium | Root is required for `chroot`. The program handles `sudo` automatically but this widens the attack surface. |
| **Side-channel attacks** – Spectre/Meltdown-class vulnerabilities | Medium | Standard kernel patching and CPU microcode updates are recommended. |
| **libseccomp dependency** – program cannot run without it | Low | Ensure `libseccomp-dev` is installed on all evaluation nodes. |
| **Kernel vulnerabilities** – user-mode isolation cannot prevent kernel exploits | Medium | Regular kernel updates and OS hardening are recommended. |
| **Time measurement** – `sysconf(_SC_CLK_TCK)` used for CPU time | Low | Accurate enough for OJ purposes; jitter is minimal. |

---

## 9. Summary

The Linux evaluation sandbox access control model presented here employs **three independent layers of defense**:

1. **chroot jail** – ensures file system isolation.
2. **seccomp-bpf system call whitelisting** – restricts available kernel interfaces.
3. **setrlimit resource limits** – enforces CPU time, memory, and file size constraints.

Together, these mechanisms provide a robust, maintainable, and future-proof security boundary for executing untrusted code in OJ environments and similar use cases.

### 9.1 Key Function Reference

| Category | Key Functions |
|----------|---------------|
| Process creation | `fork`, `execve`, `waitpid` |
| chroot jail | `chroot`, `chdir` |
| seccomp | `seccomp_init`, `seccomp_rule_add`, `seccomp_load`, `seccomp_release` |
| Resource limits | `setrlimit`, `getrlimit` |
| Process monitoring | `read` (/proc files), `waitpid`, `kill` |
| Synchronization | `pipe2`, `read`, `close` |

### 9.2 Key Constant Reference

| Constant | Header / Source | Purpose |
|----------|-----------------|---------|
| `RLIMIT_AS` | sys/resource.h | Address space (memory) limit |
| `RLIMIT_FSIZE` | sys/resource.h | File size limit |
| `RLIMIT_CPU` | sys/resource.h | CPU time limit |
| `SCMP_ACT_ALLOW` | seccomp.h | seccomp action: allow syscall |
| `SCMP_ACT_KILL` | seccomp.h | seccomp action: kill process |
| `O_CLOEXEC` | fcntl.h | Pipe flag: close on exec |

---

*Document version: 1.0*

*Last updated: 2026.08.30*

## Copyright

© 2026 **chenyichen0420** (18190772965@163.com). All rights reserved.  

This document and the described access control model are proprietary and confidential. Unauthorized reproduction, distribution, or use without prior written permission is strictly prohibited.
