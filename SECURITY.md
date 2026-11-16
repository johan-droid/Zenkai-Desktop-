# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.1   | :white_check_mark: |
| < 0.0.1 | :x:                |

## Security Architecture & Design Principles

Zenkai Desktop enforces strict process isolation and defense-in-depth security:

1. **Strict Context Isolation**:
   - `contextIsolation: true` is strictly enforced on all `BrowserWindow` instances.
   - `nodeIntegration: false` prevents renderer execution of Node.js system calls.
   - `sandbox: true` confines the rendering engine to an unprivileged OS process sandbox.

2. **Guarded IPC Contracts**:
   - All IPC channels are defined in `src/shared/ipc-contract.ts` and validated via Zod schemas.
   - No dynamic `eval`, reflection, or wildcard channel invocation is permitted.

3. **In-Memory Decryption**:
   - Stream decryption keys and initialization vectors are processed solely in memory buffers and never persisted to the disk filesystem.

4. **Network & Protocol Protection**:
   - Custom protocols (`zenkai://`, `atom://`) are strictly validated against origin allowlists.
   - SSRF defenses prevent renderer navigation or proxying to RFC 1918 private IP ranges or metadata service endpoints.

## Reporting a Vulnerability

If you discover a security vulnerability within Zenkai Desktop:

1. **Do not disclose publicly**: Avoid opening public issues or pull requests detailing the vulnerability.
2. **Contact maintainers**: Submit a detailed advisory or email `dev@zenkai.cfd` with:
   - Affected version and platform (Linux, Windows, macOS).
   - Detailed reproduction steps or proof-of-concept.
   - Potential impact assessment.
3. **Response Timeline**:
   - Initial acknowledgement: within 48 hours.
   - Triage and mitigation assessment: within 5 business days.
   - Coordinated public release and advisory: following deployment of remediated build.

