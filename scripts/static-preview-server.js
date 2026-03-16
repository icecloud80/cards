const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_PREVIEW_HOST = "127.0.0.1";
const DEFAULT_PREVIEW_PORT = 3721;
const DEFAULT_PREVIEW_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PREVIEW_INDEX = "/index.html";
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
});

/**
 * 作用：
 * 把 URL 路径安全地映射到仓库里的静态文件绝对路径。
 *
 * 为什么这样写：
 * 本地预览和 UI smoke 都需要通过同一套 HTTP 静态服务读取页面资源；
 * 把路径归一化和越界保护收口到这里，后续切换入口时不会出现两套安全口径。
 *
 * 输入：
 * @param {string} requestPath - HTTP 请求中的 pathname。
 * @param {string} [rootDir=DEFAULT_PREVIEW_ROOT] - 本地预览的静态根目录。
 * @param {string} [defaultPage=DEFAULT_PREVIEW_INDEX] - 访问根路径时回退到的首页路径。
 *
 * 输出：
 * @returns {string} 对应到静态根目录内的绝对文件路径。
 *
 * 注意：
 * - 根路径会自动回退到默认首页，方便手动直接打开服务器根地址。
 * - 任何目录穿越都必须抛错，不能让服务读到仓库根目录之外的文件。
 */
function resolveStaticFilePath(requestPath, rootDir = DEFAULT_PREVIEW_ROOT, defaultPage = DEFAULT_PREVIEW_INDEX) {
  const absoluteRoot = path.resolve(rootDir);
  const normalizedPath = requestPath === "/" ? defaultPage : requestPath;
  const decodedPath = decodeURIComponent(normalizedPath);
  const absolutePath = path.resolve(absoluteRoot, `.${decodedPath}`);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`非法静态资源路径：${requestPath}`);
  }
  return absolutePath;
}

/**
 * 作用：
 * 根据文件扩展名返回浏览器应使用的 MIME 类型。
 *
 * 为什么这样写：
 * 本地预览会同时承载 HTML、脚本、样式和图片；
 * 统一 MIME 映射后，浏览器不会因为类型错误而屏蔽脚本或素材。
 *
 * 输入：
 * @param {string} filePath - 要返回给浏览器的静态文件绝对路径。
 *
 * 输出：
 * @returns {string} 对应的 MIME 类型字符串。
 *
 * 注意：
 * - 未显式列出的扩展名统一回退到 `application/octet-stream`。
 * - 这里只覆盖当前项目实际需要的最小文件类型集合。
 */
function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * 作用：
 * 把监听地址格式化成适合复制到浏览器里的 origin。
 *
 * 为什么这样写：
 * 服务器可能监听在 `0.0.0.0` 这类绑定地址上；
 * 返回给用户时需要转成可直接访问的浏览器地址，避免出现“服务起来了但地址不能点开”的情况。
 *
 * 输入：
 * @param {string} host - 当前 server 绑定的 host。
 * @param {number} port - 当前 server 实际监听的端口。
 *
 * 输出：
 * @returns {string} 可直接在浏览器访问的 origin。
 *
 * 注意：
 * - `0.0.0.0` 只适合作为绑定地址，对外展示时统一回写为 `127.0.0.1`。
 * - 这里不校验端口合法性，调用方需在更早阶段完成参数校验。
 */
function buildPreviewOrigin(host, port) {
  const normalizedHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return `http://${normalizedHost}:${port}`;
}

/**
 * 作用：
 * 解析本地预览服务的命令行参数。
 *
 * 为什么这样写：
 * 手动预览和后续脚本化流程都需要稳定的 `host / port / root` 配置入口；
 * 单独做参数解析后，CLI 行为更容易测试，也方便 Node 与 Python 版本对齐。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 启动脚本时收到的参数列表。
 *
 * 输出：
 * @returns {{host: string, port: number, rootDir: string}} 归一化后的预览服务配置。
 *
 * 注意：
 * - 未识别参数必须直接抛错，避免错误拼写被静默忽略。
 * - `rootDir` 会统一转成绝对路径，方便日志和浏览器预览直接对照。
 */
function parsePreviewServerArgs(argv = process.argv.slice(2)) {
  const options = {
    host: DEFAULT_PREVIEW_HOST,
    port: DEFAULT_PREVIEW_PORT,
    rootDir: DEFAULT_PREVIEW_ROOT,
  };

  for (const argument of argv) {
    if (argument.startsWith("--host=")) {
      options.host = argument.split("=")[1] || options.host;
      continue;
    }
    if (argument.startsWith("--port=")) {
      options.port = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--root=")) {
      options.rootDir = path.resolve(process.cwd(), argument.split("=")[1] || options.rootDir);
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  if (!options.host || /\s/.test(options.host)) {
    throw new Error(`host 非法：${options.host}`);
  }
  if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65535) {
    throw new Error(`port 必须是 1-65535 的整数，当前为 ${options.port}`);
  }

  options.rootDir = path.resolve(options.rootDir);
  return options;
}

/**
 * 作用：
 * 启动一个为当前仓库静态文件提供服务的本地 HTTP 服务器。
 *
 * 为什么这样写：
 * 浏览器直接打开 `file://` 时，缓存、脚本和相对路径行为都不够稳定；
 * 统一走一个无缓存的本地 server，能让手动预览和自动化 smoke 更接近真实线上访问方式。
 *
 * 输入：
 * @param {{preferredPort?: number, host?: string, rootDir?: string, defaultPage?: string}} [options={}] - 服务器启动配置。
 *
 * 输出：
 * @returns {Promise<{server: import("node:http").Server, origin: string, host: string, port: number, rootDir: string}>} 已启动的服务实例与访问信息。
 *
 * 注意：
 * - 指定端口被占用时会自动回退到系统随机端口，减少手动排障成本。
 * - 调用方负责在任务完成后关闭 `server`，避免残留端口占用。
 */
async function startStaticServer(options = {}) {
  const host = options.host || DEFAULT_PREVIEW_HOST;
  const rootDir = path.resolve(options.rootDir || DEFAULT_PREVIEW_ROOT);
  const preferredPort = Number.isInteger(options.preferredPort) ? options.preferredPort : DEFAULT_PREVIEW_PORT;
  const defaultPage = options.defaultPage || DEFAULT_PREVIEW_INDEX;

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const filePath = resolveStaticFilePath(requestUrl.pathname, rootDir, defaultPage);
      const fileBuffer = await fsp.readFile(filePath);
      response.writeHead(200, {
        "Content-Type": getMimeType(filePath),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      response.end(fileBuffer);
    } catch (error) {
      const statusCode = error.code === "ENOENT" ? 404 : 500;
      response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(statusCode === 404 ? "Not Found" : String(error.message || error));
    }
  });

  /**
   * 作用：
   * 尝试在指定端口上监听 HTTP 服务。
   *
   * 为什么这样写：
   * 预览服务需要先尝试固定端口，再在端口冲突时平滑回退；
   * 把监听逻辑单独收口后，主流程能专注于“先试固定端口，再试随机端口”的策略判断。
   *
   * 输入：
   * @param {number} port - 当前尝试监听的端口；传 `0` 表示交给系统分配。
   *
   * 输出：
   * @returns {Promise<number>} 最终监听成功的端口号。
   *
   * 注意：
   * - 一旦监听成功，必须移除本轮错误监听，避免后续关闭或二次监听时误触发。
   * - 这里只负责启动监听，不负责拼接最终 origin。
   */
  async function listenOnPort(port) {
    return new Promise((resolve, reject) => {
      const handleError = (error) => {
        server.off("listening", handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.off("error", handleError);
        resolve(server.address().port);
      };

      server.once("error", handleError);
      server.once("listening", handleListening);
      server.listen(port, host);
    });
  }

  let actualPort;
  try {
    actualPort = await listenOnPort(preferredPort);
  } catch (error) {
    if (error.code !== "EADDRINUSE") {
      throw error;
    }
    actualPort = await listenOnPort(0);
  }

  return {
    server,
    origin: buildPreviewOrigin(host, actualPort),
    host,
    port: actualPort,
    rootDir,
  };
}

module.exports = {
  DEFAULT_PREVIEW_HOST,
  DEFAULT_PREVIEW_INDEX,
  DEFAULT_PREVIEW_PORT,
  DEFAULT_PREVIEW_ROOT,
  MIME_TYPES,
  resolveStaticFilePath,
  getMimeType,
  buildPreviewOrigin,
  parsePreviewServerArgs,
  startStaticServer,
};
