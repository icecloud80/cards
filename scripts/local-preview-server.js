const {
  parsePreviewServerArgs,
  startStaticServer,
} = require("./static-preview-server");

/**
 * 作用：
 * 启动一个长期驻留的本地预览服务器，并把常用预览入口打印到终端。
 *
 * 为什么这样写：
 * 这次需求的目标是“改完后统一通过 HTTP 看页面效果”，而不是继续双击本地文件；
 * 提供一个专门的 CLI 入口后，后续每次改完都能稳定复用同一套浏览器访问方式。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 启动脚本时收到的命令行参数。
 *
 * 输出：
 * @returns {Promise<void>} 服务启动后会持续监听，直到收到退出信号。
 *
 * 注意：
 * - 默认优先监听 `127.0.0.1:3721`，若端口冲突会自动回退到随机端口。
 * - 当前脚本只负责预览，不承担热更新；修改文件后刷新浏览器即可看到最新内容。
 */
async function main(argv = process.argv.slice(2)) {
  const options = parsePreviewServerArgs(argv);
  const { server, origin, port, rootDir } = await startStaticServer({
    preferredPort: options.port,
    host: options.host,
    rootDir: options.rootDir,
  });

  console.log(`Local preview server is running on ${origin}`);
  console.log(`- root: ${rootDir}`);
  console.log(`- port: ${port}`);
  console.log(`- home: ${origin}/`);
  console.log(`- pc: ${origin}/index1.html`);
  console.log(`- mobile: ${origin}/index2.html`);
  console.log(`- static mock: ${origin}/index-static.html`);
  console.log("Press Ctrl+C to stop the server.");

  /**
   * 作用：
   * 在收到退出信号时优雅关闭当前预览服务器。
   *
   * 为什么这样写：
   * 本地预览通常会持续开着，直接强退容易留下不完整日志或端口占用误判；
   * 统一做信号收口后，用户每次结束预览都能拿到稳定的关闭行为。
   *
   * 输入：
   * @param {string} signalName - 当前触发关闭的系统信号名。
   *
   * 输出：
   * @returns {void} 关闭成功后退出当前 Node 进程。
   *
   * 注意：
   * - `server.close` 是异步回调风格，这里必须等它结束再退出。
   * - 若关闭过程中报错，需要设置非零退出码，方便脚本化场景感知失败。
   */
  function shutdown(signalName) {
    console.log(`Stopping local preview server (${signalName})...`);
    server.close((error) => {
      if (error) {
        console.error(error.stack || error.message || String(error));
        process.exitCode = 1;
      }
      process.exit();
    });
  }

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
