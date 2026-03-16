const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  DEFAULT_PREVIEW_HOST,
  DEFAULT_PREVIEW_PORT,
  DEFAULT_PREVIEW_ROOT,
} = require("./static-preview-server");

const DEFAULT_LOCK_STALE_MS = 15000;

/**
 * 作用：
 * 判断当前目录是否属于需要自动启动预览服务的项目工作区。
 *
 * 为什么这样写：
 * 目录切换钩子会在很多路径上触发；
 * 把“只在 cards 项目目录及其子目录内生效”集中判断后，能避免误伤其它仓库或普通终端会话。
 *
 * 输入：
 * @param {string} currentDir - 当前 shell 所在目录。
 * @param {string} [projectRoot=DEFAULT_PREVIEW_ROOT] - 目标项目根目录。
 *
 * 输出：
 * @returns {boolean} `true` 表示当前目录应尝试确保预览服务已启动。
 *
 * 注意：
 * - 项目根目录本身与其所有子目录都应返回 `true`。
 * - 目录会先转成绝对路径后再比较，避免相对路径造成误判。
 */
function shouldAutoStartForDirectory(currentDir, projectRoot = DEFAULT_PREVIEW_ROOT) {
  const absoluteCurrentDir = path.resolve(String(currentDir || ""));
  const absoluteProjectRoot = path.resolve(projectRoot);
  return absoluteCurrentDir === absoluteProjectRoot || absoluteCurrentDir.startsWith(`${absoluteProjectRoot}${path.sep}`);
}

/**
 * 作用：
 * 为自动启动 helper 解析命令行参数。
 *
 * 为什么这样写：
 * 这个 helper 既会被 `zsh` 钩子调用，也可能被手动排障复用；
 * 保留独立 CLI 解析后，测试可以直接锁住参数口径，shell 配置也更稳定。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 启动 helper 时收到的参数列表。
 *
 * 输出：
 * @returns {{cwd: string, host: string, port: number, projectRoot: string, quiet: boolean}} 归一化后的 helper 配置。
 *
 * 注意：
 * - 未识别参数必须直接抛错，避免 shell 钩子静默带错配置。
 * - `cwd` 和 `projectRoot` 都会被解析为绝对路径。
 */
function parseEnsurePreviewArgs(argv = process.argv.slice(2)) {
  const options = {
    cwd: process.cwd(),
    host: DEFAULT_PREVIEW_HOST,
    port: DEFAULT_PREVIEW_PORT,
    projectRoot: DEFAULT_PREVIEW_ROOT,
    quiet: false,
  };

  for (const argument of argv) {
    if (argument === "--quiet") {
      options.quiet = true;
      continue;
    }
    if (argument.startsWith("--cwd=")) {
      options.cwd = path.resolve(argument.split("=")[1] || options.cwd);
      continue;
    }
    if (argument.startsWith("--host=")) {
      options.host = argument.split("=")[1] || options.host;
      continue;
    }
    if (argument.startsWith("--port=")) {
      options.port = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--project-root=")) {
      options.projectRoot = path.resolve(argument.split("=")[1] || options.projectRoot);
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

  options.cwd = path.resolve(options.cwd);
  options.projectRoot = path.resolve(options.projectRoot);
  return options;
}

/**
 * 作用：
 * 生成当前项目自动启动 helper 使用的临时锁文件路径。
 *
 * 为什么这样写：
 * 多个 shell 同时进入项目目录时，可能并发触发“确保服务已启动”逻辑；
 * 用固定锁文件能避免重复启动多个预览进程。
 *
 * 输入：
 * @param {string} [projectRoot=DEFAULT_PREVIEW_ROOT] - 当前项目根目录。
 *
 * 输出：
 * @returns {string} 位于 `/tmp` 下的锁文件绝对路径。
 *
 * 注意：
 * - 锁文件名需要包含项目目录名，避免未来多个项目共用时相互覆盖。
 * - 这里只负责生成路径，不负责创建或释放锁。
 */
function getEnsureLockPath(projectRoot = DEFAULT_PREVIEW_ROOT) {
  return path.join("/tmp", `${path.basename(path.resolve(projectRoot))}-preview-autostart.lock`);
}

/**
 * 作用：
 * 尝试获取一次自动启动预览服务的短时文件锁。
 *
 * 为什么这样写：
 * 如果多个 shell 几乎同时进到项目目录，它们都会触发 helper；
 * 用轻量锁先串行化“检查端口并可能启动服务”这一步，可以避免一个进程占住固定端口，另一个又回退到随机端口。
 *
 * 输入：
 * @param {string} lockPath - 锁文件绝对路径。
 * @param {number} [staleMs=DEFAULT_LOCK_STALE_MS] - 锁文件超过多久视为陈旧，可被新进程接管。
 *
 * 输出：
 * @returns {{release: Function}|null} 成功时返回释放锁的方法；若已有有效锁则返回 `null`。
 *
 * 注意：
 * - 锁文件若已陈旧，会先清理再重试一次。
 * - 调用方必须在完成后执行 `release()`，避免留下误判。
 */
function acquireEnsureLock(lockPath, staleMs = DEFAULT_LOCK_STALE_MS) {
  const absoluteLockPath = path.resolve(lockPath);

  function tryOpen() {
    const fileDescriptor = fs.openSync(absoluteLockPath, "wx");
    fs.writeFileSync(fileDescriptor, String(process.pid));
    return fileDescriptor;
  }

  try {
    const fileDescriptor = tryOpen();
    return {
      release() {
        try {
          fs.closeSync(fileDescriptor);
        } catch (error) {
          // 忽略重复关闭，确保释放锁逻辑保持幂等。
        }
        try {
          fs.unlinkSync(absoluteLockPath);
        } catch (error) {
          if (error?.code !== "ENOENT") {
            throw error;
          }
        }
      },
    };
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }

  const stats = fs.statSync(absoluteLockPath, { throwIfNoEntry: false });
  if (!stats) {
    return acquireEnsureLock(absoluteLockPath, staleMs);
  }
  if (Date.now() - stats.mtimeMs > staleMs) {
    fs.unlinkSync(absoluteLockPath);
    return acquireEnsureLock(absoluteLockPath, staleMs);
  }
  return null;
}

/**
 * 作用：
 * 以短超时探测预览端口当前是否已经可连接。
 *
 * 为什么这样写：
 * 自动启动场景不需要复杂健康检查；
 * 只要当前端口已有服务监听，就不应重复拉起新的预览进程。
 *
 * 输入：
 * @param {string} host - 要探测的 host。
 * @param {number} port - 要探测的端口。
 * @param {number} [timeoutMs=400] - 连接探测超时时间。
 *
 * 输出：
 * @returns {Promise<boolean>} `true` 表示当前端口已有服务监听。
 *
 * 注意：
 * - 这里只判断“端口可连接”，不校验返回内容是否来自 cards 预览服务。
 * - 探测失败必须吞掉网络异常并返回 `false`，避免 shell 钩子报错打断用户操作。
 */
function isPreviewServerReachable(host, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (reachable) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish(true);
    });
    socket.once("timeout", () => {
      finish(false);
    });
    socket.once("error", () => {
      finish(false);
    });
  });
}

/**
 * 作用：
 * 构造后台启动本地预览服务所需的进程参数。
 *
 * 为什么这样写：
 * 自动启动场景要尽量轻量，并避免依赖 shell 展开；
 * 统一返回一套可测试的 `spawn` 配置后，shell 钩子和手动排障都能复用同一入口。
 *
 * 输入：
 * @param {{projectRoot: string}} options - 当前项目根目录等启动配置。
 *
 * 输出：
 * @returns {{command: string, args: string[], spawnOptions: object}} 可直接传给 `spawn` 的启动参数。
 *
 * 注意：
 * - 这里直接调用 Node 执行仓库脚本，不再额外套 `npm run`，减少启动链路。
 * - 子进程必须 `detached + unref`，确保不会阻塞当前 shell。
 */
function buildDetachedPreviewStartSpec(options) {
  const projectRoot = path.resolve(options.projectRoot || DEFAULT_PREVIEW_ROOT);
  return {
    command: process.execPath,
    args: [path.join(projectRoot, "scripts/local-preview-server.js")],
    spawnOptions: {
      cwd: projectRoot,
      detached: true,
      stdio: "ignore",
    },
  };
}

/**
 * 作用：
 * 在需要时于后台启动本地预览服务。
 *
 * 为什么这样写：
 * 目录进入钩子的目标不是每次都无脑拉起新进程，而是“只在服务未运行时补启动一次”；
 * 把检查、加锁和后台拉起整合后，shell 配置就只需要调用这一条入口。
 *
 * 输入：
 * @param {{cwd: string, host: string, port: number, projectRoot: string, quiet: boolean}} options - 自动启动所需配置。
 *
 * 输出：
 * @returns {Promise<{started: boolean, reason: string}>} 返回本次是否真正启动了新服务以及原因。
 *
 * 注意：
 * - 当前目录不在项目内时必须直接返回，不做任何端口探测。
 * - 若未获取到锁，说明已有并发启动过程在进行中，应直接安静退出。
 */
async function ensurePreviewServer(options) {
  if (!shouldAutoStartForDirectory(options.cwd, options.projectRoot)) {
    return {
      started: false,
      reason: "outside-project",
    };
  }

  if (await isPreviewServerReachable(options.host, options.port)) {
    return {
      started: false,
      reason: "already-running",
    };
  }

  const lock = acquireEnsureLock(getEnsureLockPath(options.projectRoot));
  if (!lock) {
    return {
      started: false,
      reason: "lock-held",
    };
  }

  try {
    if (await isPreviewServerReachable(options.host, options.port)) {
      return {
        started: false,
        reason: "already-running",
      };
    }

    const startSpec = buildDetachedPreviewStartSpec(options);
    const child = spawn(startSpec.command, startSpec.args, startSpec.spawnOptions);
    child.unref();
    return {
      started: true,
      reason: "spawned",
    };
  } finally {
    lock.release();
  }
}

/**
 * 作用：
 * 作为 CLI 入口在 shell 钩子里执行“确保预览服务已启动”。
 *
 * 为什么这样写：
 * 进入目录钩子要求足够安静、足够快；
 * CLI 只打印极少量调试信息，并把是否真正启动服务的决策留给 helper 自己处理。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 命令行参数列表。
 *
 * 输出：
 * @returns {Promise<void>} 正常时静默退出；在非 `--quiet` 模式下会输出简短状态。
 *
 * 注意：
 * - `--quiet` 主要给 `~/.zshrc` 钩子使用，避免每次进目录都刷屏。
 * - 异常时直接抛错，让手动排障仍然能拿到明确信息。
 */
async function main(argv = process.argv.slice(2)) {
  const options = parseEnsurePreviewArgs(argv);
  const result = await ensurePreviewServer(options);

  if (!options.quiet) {
    console.log(`${result.started ? "started" : "skipped"}:${result.reason}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_LOCK_STALE_MS,
  shouldAutoStartForDirectory,
  parseEnsurePreviewArgs,
  getEnsureLockPath,
  acquireEnsureLock,
  isPreviewServerReachable,
  buildDetachedPreviewStartSpec,
  ensurePreviewServer,
  main,
};
