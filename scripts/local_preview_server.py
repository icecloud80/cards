import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

DEFAULT_PREVIEW_HOST = "127.0.0.1"
DEFAULT_PREVIEW_PORT = 4173
DEFAULT_PREVIEW_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PREVIEW_INDEX = "/index.html"


def parse_preview_server_args(argv=None):
    """
    作用：
    解析 Python 版本本地预览服务的命令行参数。

    为什么这样写：
    这次除了 Node 入口，也要保留 Python 入口给未来脚本化工作流使用；
    先把参数口径固定下来，后续无论从终端还是自动任务启动，都能保持一致。

    输入：
    @param {list[str] | None} argv - 启动脚本收到的参数列表；为空时使用系统默认参数源。

    输出：
    @returns {argparse.Namespace} 包含 host、port 和 root_dir 的解析结果。

    注意：
    - `root_dir` 会被转成绝对路径，方便日志和定位页面资源。
    - `argparse` 会自动拦截未知参数，避免错误拼写被忽略。
    """
    parser = argparse.ArgumentParser(description="Run the local static preview server.")
    parser.add_argument("--host", default=DEFAULT_PREVIEW_HOST, help="Host to bind the preview server to.")
    parser.add_argument("--port", type=int, default=DEFAULT_PREVIEW_PORT, help="Preferred port for the preview server.")
    parser.add_argument(
        "--root",
        dest="root_dir",
        default=str(DEFAULT_PREVIEW_ROOT),
        help="Static root directory to serve files from.",
    )
    args = parser.parse_args(argv)

    if not args.host or any(character.isspace() for character in args.host):
        raise ValueError(f"host 非法：{args.host}")
    if not isinstance(args.port, int) or args.port <= 0 or args.port > 65535:
        raise ValueError(f"port 必须是 1-65535 的整数，当前为 {args.port}")

    args.root_dir = str(Path(args.root_dir).resolve())
    return args


def resolve_static_file_path(request_path, root_dir=DEFAULT_PREVIEW_ROOT, default_page=DEFAULT_PREVIEW_INDEX):
    """
    作用：
    把 HTTP 请求路径安全地映射到静态根目录下的真实文件路径。

    为什么这样写：
    Python 入口也需要和 Node 入口保持相同的目录穿越防护；
    单独抽成 helper 后，测试和 HTTP handler 都能复用同一套规则。

    输入：
    @param {str} request_path - 请求中的 pathname。
    @param {str | Path} root_dir - 当前预览服务的静态根目录。
    @param {str} default_page - 根路径访问时的默认首页。

    输出：
    @returns {Path} 指向静态根目录内某个文件的绝对路径对象。

    注意：
    - 访问 `/` 时会自动回退到默认首页。
    - 一旦发现越界路径，必须直接抛出异常。
    """
    absolute_root = Path(root_dir).resolve()
    normalized_path = default_page if request_path == "/" else request_path
    decoded_path = unquote(normalized_path)
    candidate_path = (absolute_root / decoded_path.lstrip("/")).resolve()
    if candidate_path != absolute_root and absolute_root not in candidate_path.parents:
        raise ValueError(f"非法静态资源路径：{request_path}")
    return candidate_path


def build_preview_origin(host, port):
    """
    作用：
    把监听地址格式化成用户可直接访问的浏览器 origin。

    为什么这样写：
    当服务绑定到 `0.0.0.0` 时，终端输出不能原样拿给浏览器打开；
    单独统一转换后，Node 和 Python 两个入口都能保持一致的展示地址。

    输入：
    @param {str} host - 当前 server 绑定的 host。
    @param {int} port - 当前 server 实际监听的端口。

    输出：
    @returns {str} 可直接复制到浏览器打开的 origin。

    注意：
    - `0.0.0.0` 会被回写成 `127.0.0.1`。
    - 这里只负责格式化，不负责校验端口是否合法。
    """
    normalized_host = "127.0.0.1" if host == "0.0.0.0" else host
    return f"http://{normalized_host}:{port}"


class NoCacheStaticPreviewHandler(SimpleHTTPRequestHandler):
    """
    作用：
    提供禁用缓存且带路径越界保护的静态文件响应。

    为什么这样写：
    用户改完文件后会频繁刷新页面看效果；
    关闭缓存能减少“明明改了文件但浏览器还在看旧资源”的误判，同时保留和 Node 入口一致的安全边界。

    输入：
    @param {object} server - 由 `ThreadingHTTPServer` 注入的 HTTP 服务实例。

    输出：
    @returns {NoCacheStaticPreviewHandler} 一个可直接响应静态文件请求的 handler。

    注意：
    - 这个 handler 依赖外部通过 `directory` 传入静态根目录。
    - 这里只服务仓库内文件，不承担目录索引或上传能力。
    """

    def end_headers(self):
        """
        作用：
        在每个响应头里补齐禁止缓存的 HTTP 头。

        为什么这样写：
        本地预览强调“保存后刷新立即生效”；
        显式关闭缓存后，样式和脚本调试时更接近我们想要的即时反馈。

        输入：
        @param {void} - 当前响应上下文由父类维护。

        输出：
        @returns {void} 调用父类方法继续发送响应头。

        注意：
        - 这里必须先写自定义 header，再调用父类 `end_headers`。
        - 不要在这里写业务日志，避免每个静态资源都刷屏。
        """
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def translate_path(self, path):
        """
        作用：
        把请求路径翻译成安全的本地文件路径。

        为什么这样写：
        `SimpleHTTPRequestHandler` 默认会按目录拼接路径；
        我们需要把根路径回退、URL 解码和越界防护都换成自己的规则，才能和 Node 版预览保持一致。

        输入：
        @param {str} path - 当前请求的原始 URL 路径。

        输出：
        @returns {str} 最终要读取的本地文件绝对路径字符串。

        注意：
        - 这里只取 URL 的 pathname，忽略查询参数。
        - 越界时直接抛错，让上层返回 500，方便定位问题。
        """
        request_path = urlsplit(path).path or "/"
        file_path = resolve_static_file_path(request_path, self.directory, DEFAULT_PREVIEW_INDEX)
        return str(file_path)

    def log_message(self, format_string, *args):
        """
        作用：
        用更轻量的单行格式输出访问日志。

        为什么这样写：
        本地预览需要一定可见性，但默认日志前缀比较啰嗦；
        换成简洁格式后，查看页面是否成功请求到资源会更直观。

        输入：
        @param {str} format_string - 父类传入的日志格式字符串。
        @param {tuple} args - 与格式字符串对应的参数列表。

        输出：
        @returns {void} 把日志写到标准错误输出。

        注意：
        - 保持和 `SimpleHTTPRequestHandler` 一样写到 stderr，方便脚本重定向。
        - 不要吞掉日志，否则排查 404 会更慢。
        """
        super().log_message("[preview] " + format_string, *args)


def main(argv=None):
    """
    作用：
    启动 Python 版本的本地预览服务，并打印常用预览地址。

    为什么这样写：
    用户明确希望未来流程支持 Python；
    保留一个标准库实现后，即使不依赖 Node，也能直接从终端起服务看页面。

    输入：
    @param {list[str] | None} argv - 启动脚本收到的参数列表。

    输出：
    @returns {void} 服务启动后会持续监听，直到用户主动终止进程。

    注意：
    - 这里不做热更新，修改文件后刷新浏览器即可。
    - 若默认端口被占用，需由调用方显式切换端口，不自动回退随机端口。
    """
    args = parse_preview_server_args(argv)
    handler = functools.partial(NoCacheStaticPreviewHandler, directory=args.root_dir)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    origin = build_preview_origin(args.host, server.server_port)

    print(f"Python local preview server is running on {origin}")
    print(f"- root: {args.root_dir}")
    print(f"- port: {server.server_port}")
    print(f"- home: {origin}/")
    print(f"- pc: {origin}/index1.html")
    print(f"- mobile: {origin}/index2.html")
    print(f"- static mock: {origin}/index-static.html")
    print("Press Ctrl+C to stop the server.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Python local preview server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
