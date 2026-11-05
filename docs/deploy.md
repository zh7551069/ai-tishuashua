# 生产部署

先把变更合并进要发布的分支，再在生产机执行 `scripts/deploy.sh`。脚本把「拉取 → 按需安装 → 构建 → 重启」收成一条命令。

不要在生产机手改业务代码或配置后直接重启。线上文件和 Git 分叉之后，下一次拉取会冲突，热修也没有评审记录。密钥放在机器本地的 `.env` 或 systemd 环境里，不要写进仓库，也不要为了改配置去改脚本。

## 线上对应关系

| 项 | 约定 |
| --- | --- |
| 仓库目录 | `/opt/tishuashua` |
| API | systemd `tishuashua-api.service`，监听 `127.0.0.1:3000`。日志：`journalctl -u tishuashua-api.service` |
| Worker | 默认会构建。若已安装 `tishuashua-worker.service` 就重启；仓库不带这份单元文件，没安装时跳过 |
| nginx | `/etc/nginx/conf.d/tishuashua.conf`。`/api/` 反代到 `127.0.0.1:3000`；`/` 的 root 是 `apps/admin/dist` |
| 后管 API 基址 | 构建期 `VITE_API_BASE=/api`。浏览器请求同源 `/api`，由 nginx 转到 API |

API 的全局前缀就是 `/api`。nginx 要把 `/api/...` 原样转到 `127.0.0.1:3000`，不要在 `proxy_pass` 里把这个前缀剥掉。脚本不修改、不重载 nginx。静态文件已经由 nginx 直接读 `apps/admin/dist`，构建覆盖这个目录即可，不用再拷贝。

小程序不在这条命令里。上传微信开发者工具的产物仍按 README 的小程序步骤走。

## 最短用法

```bash
cd /opt/tishuashua
sudo ./scripts/deploy.sh
```

也可以用仓库属主执行 `./scripts/deploy.sh`。脚本只会用 `sudo -n systemctl` 重启服务，所以这个用户需要免密 sudo。整段用 `sudo` 跑也可以，但 root 的 `PATH` 里要有 Node.js 20+ 和仓库要求的 pnpm。

常用参数：

```bash
sudo ./scripts/deploy.sh --dry-run
sudo ./scripts/deploy.sh --ref main
sudo ./scripts/deploy.sh --admin-only
sudo ./scripts/deploy.sh --api-only
sudo ./scripts/deploy.sh --skip-pull
```

- `--ref` / `--branch`：部署 `origin` 上的分支，或某个已经 fetch 到的标签 / 提交。
- `--admin-only`：只构建后管，不重启 API 和 Worker。
- `--api-only`：只构建并重启 API。
- `--skip-pull`：不拉取，用当前 HEAD 再构建一次。仍拒绝未提交的已跟踪改动。
- `--dry-run`：只打印动作。本地和 CI 可以用它检查参数，不必连接生产机。

不在 `/opt/tishuashua` 时，真正执行会被拒绝。演习用 `--dry-run`。确认要在其他目录部署时，设置 `TISHUASHUA_ALLOW_NONSTANDARD_ROOT=1`。

失败时退出码不是 0，并打印 `[deploy] 错误：...`。构建失败不会重启服务，线上进程继续跑上一版。重启后的存活检查是 `GET http://127.0.0.1:3000/api/health`。API 没起来时，用 `journalctl -u tishuashua-api.service -n 80 --no-pager` 看原因。

## 后管的 VITE_API_BASE

Vite 只从 `apps/admin/.env*` 注入 `VITE_` 变量，仓库根目录 `.env` 里的 `VITE_API_BASE` 不会进后管。

生产值是 `/api`，示例在 `apps/admin/.env.production.example`。可以复制为 `apps/admin/.env.production`（该文件已 gitignore）。部署脚本还会在构建前 `export VITE_API_BASE=/api`。Vite 里，已经存在的环境变量优先于 env 文件，所以即使 `apps/admin/.env` 仍是本机的 `http://127.0.0.1:3000/api`，生产构建也不会把它打进去。

`turbo.json` 把 `VITE_API_BASE` 算进 build 缓存键，避免沿用一次用错基址的后管产物。

构建结束后，脚本检查 `apps/admin/dist` 里有内联的 `"/api"`。没有就失败退出。

## 密钥

脚本不 `source` `.env`，不打印、不改写 `ADMIN_PASSWORD`、`WECHAT_APP_SECRET` 或其他密钥。构建前会从**本进程**环境里去掉这些变量，避免子进程的日志带上它们。systemd 里的环境不动，API 仍然使用机器上原来的口令和微信密钥。

不要把真实 `.env`、`.env.production` 或密钥提交进仓库。
