import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 作用：
 * 定义首发 App 壳的 Capacitor 基础配置。
 *
 * 为什么这样写：
 * 当前仓库要在不重写玩法核心的前提下生成 iOS / Android 原生壳；
 * 把 App 名称、包名和 Web 构建目录固定在同一份配置里，
 * 可以让本地构建、`npx cap sync` 和后续商店提审始终使用同一套元数据。
 *
 * 输入：
 * @param {void} - 配置文件由 Capacitor CLI 在同步和打开原生工程时直接读取。
 *
 * 输出：
 * @returns {CapacitorConfig} 当前项目的 App 壳配置对象。
 *
 * 注意：
 * - `webDir` 固定指向 `dist/app`，必须先运行 `npm run build:app-web` 再同步原生壳。
 * - `appId` 已按当前首发命名固定为 `com.nolanli.cards`，提审前不要随意改动。
 */
const config: CapacitorConfig = {
  appId: "com.nolanli.cards",
  appName: "找朋友升级",
  webDir: "dist/app",
  bundledWebRuntime: false,
};

export default config;
