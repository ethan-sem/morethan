# M2-06 Web Worker 非阻塞解析实施说明

> 完成日期：2026-08-09  
> 状态：已完成  
> 范围：PDF、DOCX、TXT 浏览器独立线程解析

## 1. 实施结果

PDF、DOCX 和 TXT 的正文解析已从页面主线程迁移到 Web Worker。文件完成 M2-05 本地预检后，其二进制所有权通过 transferable `ArrayBuffer` 转移给对应 Worker，避免结构化克隆产生第二份大文件副本。

解析期间页面仍可滚动、切换文字输入方式或主动停止任务。任务成功、失败、取消或超时后，Worker 都会立即终止，不保留可复用的简历线程或正文状态。

## 2. 按格式拆分

没有使用一个包含全部依赖的通用大 Worker，而是拆分为：

- `pdfParser.worker.js`：只包含 PDF 文本解析边界；
- `docxParser.worker.js`：只包含 Mammoth DOCX 原始文本抽取；
- `txtParser.worker.js`：只包含轻量文本解码和规范化。

这样用户选择 TXT 时不会下载 PDF.js 或 Mammoth；选择 DOCX 时也不会加载 PDF 解析代码。Worker 只在用户选择对应文件后创建。

## 3. 任务协议

主线程只向 Worker 发送：

- `type: parse`；
- 已确认的 `pdf`、`docx` 或 `txt` 格式；
- 已通过预检的 transferable `ArrayBuffer`。

Worker 只返回三类消息：

- `progress`：PDF 页码、总页数和百分比；
- `result`：现有规范化解析结果；
- `error`：经过白名单清洗的固定错误码。

底层异常 message、文件名、路径和正文不会跨线程返回。错误码只允许 `PDF_*`、`DOCX_*`、`TXT_*` 或 `WORKER_*` 格式，其他异常统一降级为对应解析失败码。

## 4. 取消、超时和线程回收

- 每次文件解析创建一个新的专用 Worker；
- 用户选择新文件、改用文字输入、离开流程或点击“停止解析”时触发 `AbortSignal`；
- 客户端收到取消后立即 `terminate()`，不等待解析库自行结束；
- 单任务默认超时为 45 秒，超时后终止 Worker 并显示压缩、重新导出或粘贴文字的建议；
- Worker 脚本崩溃、消息反序列化失败和启动失败均转换为固定 `WORKER_*` 错误；
- 结果到达后清除定时器、取消监听并终止 Worker。

当前浏览器若无法启动 Web Worker，不回退到可能卡住页面的同步解析，而是提示升级浏览器或使用粘贴、手工填写。

## 5. 用户反馈

解析状态区现在显示：

- 当前由独立解析线程处理；
- PDF 页级百分比，DOCX/TXT 使用不确定进度动画；
- “页面仍可操作，不会向网络发送文件或正文”；
- 可随时点击的“停止解析”按钮。

移动端停止按钮会进入正常文档流，避免覆盖状态文字。

## 6. 隐私与安全

- Worker 来自同一静态站点构建产物，不访问远程解析服务；
- 输入仍是本地二进制，不接受 URL；
- Worker 不写入 localStorage、sessionStorage、IndexedDB 或 Cache Storage；
- transferable 传输后主线程不再持有可用的原二进制缓冲区；
- 每项任务使用一次性线程，结束后不存在跨用户或跨文件状态复用；
- PDF.js 的脚本、XFA、Worker Fetch 和 WASM 相关禁用项保持不变。

## 7. 验证证据

`pnpm run check` 已通过：

- ESLint：通过；
- 严格 JSDoc/TypeScript 检查：通过；
- Vitest：13 个测试文件、64 项测试全部通过；
- PDF/DOCX 解析依赖构建探针：通过；
- Vite 生产构建及 Worker 资源输出：通过。

自动化测试覆盖协议路由、格式隔离、进度回传、transferable 发送、成功回收、主动取消、45 秒超时、线程崩溃、异常消息、启动失败、传输失败、错误码清洗和页面停止操作。

## 8. 构建结果

- 页面主包：86.95 kB gzip；
- TXT Worker：4.30 kB；
- PDF Worker：433.62 kB；
- DOCX Worker：503.24 kB；
- PDF.js 内部 Worker：1,262.39 kB。

Worker 数字为构建工具输出的未压缩资源大小。所有格式 Worker 均为选择文件后的按需资源，未进入首页初始包。

## 9. 后续边界

M2 浏览器本地简历解析阶段至此完成。跨 Chrome、Edge、Safari 和移动端的真实浏览器流程验证仍归入 M7-03；性能压力样本和低性能设备验证归入 M7-05。M3-01 版本化 `ResumeFacts` 数据结构现已完成，后续进入 M3-02。
