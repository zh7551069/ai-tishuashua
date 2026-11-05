#!/usr/bin/env bash
# 题刷刷生产部署：拉取已合并的 Git 版本，按需安装，构建 API / Worker / 后管，再重启 systemd。
# 不读取、不修改、不提交 .env。不改 nginx，不拷贝静态文件。用法见 docs/deploy.md。
set -euo pipefail

umask 022
export GIT_TERMINAL_PROMPT=0
export GIT_MERGE_AUTOEDIT=no
export TURBO_TELEMETRY_DISABLED=1

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd -P)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="${DIR}/${SOURCE}"
done
ROOT="$(cd "$(dirname "$SOURCE")/.." && pwd -P)"

PRODUCTION_ROOT="${TISHUASHUA_PRODUCTION_ROOT:-/opt/tishuashua}"
API_UNIT="${TISHUASHUA_API_UNIT:-tishuashua-api.service}"
WORKER_UNIT="${TISHUASHUA_WORKER_UNIT:-tishuashua-worker.service}"
API_HEALTH_URL="${TISHUASHUA_API_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
WORKER_HEALTH_URL="${TISHUASHUA_WORKER_HEALTH_URL:-http://127.0.0.1:3001/health}"
NGINX_CONF="${TISHUASHUA_NGINX_CONF:-/etc/nginx/conf.d/tishuashua.conf}"
ADMIN_API_BASE="/api"

REF=""
ADMIN_ONLY=0
API_ONLY=0
SKIP_PULL=0
DRY_RUN=0

usage() {
  cat <<'EOF'
用法：scripts/deploy.sh [选项]

在生产机仓库（默认 /opt/tishuashua）拉取已经合并的版本，按需安装依赖，
构建 API、Worker 和管理后台，然后重启 systemd。后管固定用 VITE_API_BASE=/api。

先把 PR 合并进要部署的分支，再在线上执行本脚本。不要手改线上业务文件后直接跑。

选项：
  --ref <分支或提交>   部署 origin 上的这个分支，或某个标签 / 提交。也可用 --branch
  --admin-only         只构建管理后台，不重启 API / Worker
  --api-only           只构建并重启 API，不构建 Worker 和后管
  --skip-pull          不 fetch / pull，部署当前 HEAD（仍拒绝未提交的已跟踪改动）
  --dry-run            只打印将执行的动作，不改仓库、不安装、不构建、不重启
  -h, --help           显示这份说明

环境覆盖（一般不用改）：
  TISHUASHUA_PRODUCTION_ROOT     默认 /opt/tishuashua
  TISHUASHUA_ALLOW_NONSTANDARD_ROOT=1
                                 允许在其他目录真正执行（演习请用 --dry-run）
  TISHUASHUA_API_UNIT            默认 tishuashua-api.service
  TISHUASHUA_WORKER_UNIT         默认 tishuashua-worker.service（未安装则跳过）
  TISHUASHUA_API_HEALTH_URL      默认 http://127.0.0.1:3000/api/health
  TISHUASHUA_WORKER_HEALTH_URL   默认 http://127.0.0.1:3001/health
  TISHUASHUA_NGINX_CONF          默认 /etc/nginx/conf.d/tishuashua.conf

脚本不以 0 退出表示失败。构建失败时不会重启服务。
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

die() {
  printf '[deploy] 错误：%s\n' "$*" >&2
  exit 1
}

run() {
  log "+ $*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  if ! "$@"; then
    die "命令失败：$*"
  fi
}

git_in_repo() {
  git -C "$ROOT" -c safe.directory="$ROOT" -c color.ui=false "$@"
}

run_git() {
  run git -C "$ROOT" -c safe.directory="$ROOT" -c color.ui=false "$@"
}

on_error() {
  local rc="$1"
  local line="$2"
  local cmd="$3"
  printf '[deploy] 失败（exit %s）于第 %s 行：%s\n' "$rc" "$line" "$cmd" >&2
}

trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --admin-only)
      ADMIN_ONLY=1
      shift
      ;;
    --api-only)
      API_ONLY=1
      shift
      ;;
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    --ref | --branch)
      [[ $# -ge 2 ]] || die "$1 需要一个分支、标签或提交。"
      REF="$2"
      shift 2
      ;;
    --ref=* | --branch=*)
      REF="${1#*=}"
      [[ -n "$REF" ]] || die "${1%%=*} 需要一个分支、标签或提交。"
      shift
      ;;
    *)
      die "未知参数：$1。可用 --help 查看用法。"
      ;;
  esac
done

if [[ "$ADMIN_ONLY" -eq 1 && "$API_ONLY" -eq 1 ]]; then
  die "--admin-only 和 --api-only 不能同时使用。"
fi

if [[ "$SKIP_PULL" -eq 1 && -n "$REF" ]]; then
  die "--ref 会切换版本，不能和 --skip-pull 一起用。"
fi

if [[ "$REF" == -* ]]; then
  die "ref 不能以 - 开头。"
fi

if [[ ! -f "$ROOT/package.json" || ! -f "$ROOT/pnpm-workspace.yaml" ]]; then
  die "在 ${ROOT} 没有找到 pnpm workspace。请在仓库根目录执行 scripts/deploy.sh。"
fi

if [[ ! -d "$ROOT/apps/api" || ! -d "$ROOT/apps/admin" || ! -d "$ROOT/apps/worker" ]]; then
  die "仓库缺少 apps/api、apps/worker 或 apps/admin，路径不对：${ROOT}"
fi

if [[ "$DRY_RUN" -eq 0 && "$ROOT" != "$PRODUCTION_ROOT" && "${TISHUASHUA_ALLOW_NONSTANDARD_ROOT:-}" != "1" ]]; then
  die "仓库在 ${ROOT}，不是 ${PRODUCTION_ROOT}。这是生产部署脚本。演习用 --dry-run；确认要在此目录真正部署时设置 TISHUASHUA_ALLOW_NONSTANDARD_ROOT=1。"
fi

if [[ "${VITE_API_BASE:-$ADMIN_API_BASE}" != "$ADMIN_API_BASE" ]]; then
  log "外部环境里的 VITE_API_BASE 不是 ${ADMIN_API_BASE}，本次后管构建改回 ${ADMIN_API_BASE}。"
fi
export VITE_API_BASE="$ADMIN_API_BASE"

# 构建不需要这些值。systemd 使用单元自己的环境，不受本进程影响。
unset ADMIN_USERNAME ADMIN_PASSWORD WECHAT_APP_ID WECHAT_APP_SECRET \
  OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET LLM_API_KEY DATABASE_URL REDIS_URL \
  || true

if [[ "$EUID" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo -n)
fi

assert_privileges() {
  if [[ "$ADMIN_ONLY" -eq 1 ]]; then
    return 0
  fi
  if [[ "$EUID" -eq 0 ]]; then
    return 0
  fi
  if sudo -n true >/dev/null 2>&1; then
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "当前不是 root，也没有免密 sudo。真正重启 systemd 时需要其中之一。"
    return 0
  fi
  die "重启 systemd 需要 root 或免密 sudo。例如：sudo ${ROOT}/scripts/deploy.sh"
}

assert_clean() {
  local dirty untracked
  dirty="$(git_in_repo status --porcelain --untracked-files=no)"
  if [[ -n "$dirty" ]]; then
    printf '%s\n' "$dirty" >&2
    die "工作树有未提交的已跟踪改动。请先走 Git 合并，不要在生产机手改后部署。"
  fi
  untracked="$(git_in_repo ls-files --others --exclude-standard || true)"
  if [[ -n "$untracked" ]]; then
    log "有未跟踪文件（.env 等已被 gitignore 的文件不会出现在这里）。脚本不会提交它们。"
    printf '%s\n' "$untracked" | head -n 20 || true
  fi
}

assert_not_ahead() {
  local upstream="$1"
  local ahead
  ahead="$(git_in_repo rev-list --count "${upstream}..HEAD")"
  if [[ "$ahead" != "0" ]]; then
    die "HEAD 比 ${upstream} 超前 ${ahead} 个提交。生产机不要部署未推送的本地提交。"
  fi
}

sync_git() {
  local branch upstream
  if [[ "$SKIP_PULL" -eq 1 ]]; then
    log "跳过拉取（--skip-pull），部署当前 HEAD：$(git_in_repo rev-parse --short HEAD)"
    branch="$(git_in_repo rev-parse --abbrev-ref HEAD)"
    if [[ "$branch" != "HEAD" ]] && git_in_repo rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
      upstream="$(git_in_repo rev-parse --abbrev-ref --symbolic-full-name '@{u}')"
      assert_not_ahead "$upstream"
    fi
    return 0
  fi

  log "拉取 origin。只接受已经推送的版本。"
  run_git fetch --prune origin

  if [[ -n "$REF" ]]; then
    checkout_ref "$REF"
    return 0
  fi

  branch="$(git_in_repo rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" == "HEAD" ]]; then
    die "当前是游离 HEAD。请指定 --ref <分支或提交>。"
  fi
  if ! git_in_repo rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    die "分支 ${branch} 没有上游。请使用 --ref <分支>。"
  fi
  upstream="$(git_in_repo rev-parse --abbrev-ref --symbolic-full-name '@{u}')"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    assert_not_ahead "$upstream"
  else
    log "正式执行时会拒绝超前于 ${upstream} 的本地提交。"
  fi
  run_git merge --ff-only "$upstream"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    log "当前版本：$(git_in_repo rev-parse --short HEAD) $(git_in_repo log -1 --format=%s)"
  fi
}

checkout_ref() {
  local ref="$1"
  local remote_branch="origin/${ref}"
  if git_in_repo show-ref --verify --quiet "refs/remotes/${remote_branch}"; then
    if git_in_repo show-ref --verify --quiet "refs/heads/${ref}"; then
      if [[ "$DRY_RUN" -eq 0 ]]; then
        local ahead
        ahead="$(git_in_repo rev-list --count "${remote_branch}..${ref}")"
        if [[ "$ahead" != "0" ]]; then
          die "本地分支 ${ref} 比 ${remote_branch} 超前 ${ahead} 个提交，已拒绝覆盖。"
        fi
      else
        log "正式执行时会拒绝超前于 ${remote_branch} 的本地提交。"
      fi
      run_git checkout "$ref"
      run_git merge --ff-only "$remote_branch"
    else
      run_git checkout --track -b "$ref" "$remote_branch"
    fi
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "本地还没有 refs/remotes/${remote_branch}。fetch 之后若它是分支会检出该分支，否则尝试把 ${ref} 当作标签或提交。"
    run_git checkout --detach "$ref"
    return 0
  fi

  if git_in_repo rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
    log "${ref} 不是 origin 上的分支，改为游离检出该提交。"
    run_git checkout --detach "$ref"
    return 0
  fi

  die "origin 上没有分支 ${ref}，本地也解析不到这个标签或提交。请确认已经合并并推送。"
}

hash_lock() {
  if [[ -f "$ROOT/pnpm-lock.yaml" ]]; then
    sha256sum "$ROOT/pnpm-lock.yaml" | awk '{print $1}'
  else
    printf 'missing\n'
  fi
}

expected_pnpm() {
  node -e 'const spec = require(process.argv[1]).packageManager || ""; if (!spec.startsWith("pnpm@")) { console.error("package.json 的 packageManager 不是 pnpm"); process.exit(1); } process.stdout.write(spec.slice(5));' \
    "$ROOT/package.json"
}

ensure_pnpm() {
  local expected current
  if ! command -v node >/dev/null 2>&1; then
    die "未找到 node。生产机需要 Node.js 20 或以上。"
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$major" -lt 20 ]]; then
    die "Node.js $(node -v) 过旧，需要 20 或以上。"
  fi
  expected="$(expected_pnpm)"
  if command -v pnpm >/dev/null 2>&1; then
    current="$(pnpm --version)"
    if [[ "$current" == "$expected" ]]; then
      log "使用 pnpm ${current}"
      return 0
    fi
    log "当前 pnpm ${current}，仓库要求 ${expected}。"
  else
    log "未找到 pnpm，将用 corepack 准备 pnpm@${expected}。"
  fi
  if ! command -v corepack >/dev/null 2>&1; then
    die "没有 corepack，无法切换到 pnpm@${expected}。"
  fi
  run corepack enable
  run corepack prepare "pnpm@${expected}" --activate
}

need_install() {
  if [[ ! -d "$ROOT/node_modules" || ! -f "$ROOT/node_modules/.modules.yaml" ]]; then
    return 0
  fi
  if [[ "$1" != "$2" ]]; then
    return 0
  fi
  return 1
}

install_deps() {
  local before="$1"
  local after="$2"
  if need_install "$before" "$after"; then
    log "安装依赖（pnpm install --frozen-lockfile）。"
    run pnpm install --frozen-lockfile
  else
    log "pnpm-lock.yaml 未变且 node_modules 已在，跳过安装。"
  fi
}

build_targets() {
  local -a filters=()
  if [[ "$ADMIN_ONLY" -eq 1 ]]; then
    filters=(--filter=@tishuashua/admin)
    log "只构建管理后台。Vite 读 apps/admin/.env*，不读仓库根 .env；进程里的 VITE_API_BASE=${ADMIN_API_BASE} 优先。"
  elif [[ "$API_ONLY" -eq 1 ]]; then
    filters=(--filter=@tishuashua/api)
    log "只构建 API。不构建 Worker 和后管，也不部署小程序。"
  else
    filters=(--filter=@tishuashua/api --filter=@tishuashua/worker --filter=@tishuashua/admin)
    log "构建 API、Worker、管理后台。不构建小程序。后管 VITE_API_BASE=${ADMIN_API_BASE}。"
  fi
  # 在仓库根目录执行，让 turbo 使用根 turbo.json。
  run pnpm exec turbo run build "${filters[@]}"
}

confirm_admin_dist() {
  local index="$ROOT/apps/admin/dist/index.html"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "构建后将确认 ${index} 存在，且产物把 API 基址内联为 ${ADMIN_API_BASE}。"
    log "nginx 的 / 已指向 apps/admin/dist 时不拷贝静态文件，也不 reload nginx。"
    return 0
  fi
  if [[ ! -f "$index" ]]; then
    die "没有 ${index}。nginx 的 / 指向这个目录，构建必须留下 index.html。"
  fi
  ADMIN_DIST="$ROOT/apps/admin/dist" ADMIN_API_BASE="$ADMIN_API_BASE" node --input-type=module <<'EOF'
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.env.ADMIN_DIST;
const apiBase = process.env.ADMIN_API_BASE;
const quoted = [`"${apiBase}"`, `'${apiBase}'`];

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, files);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(path);
    }
  }
  return files;
}

const files = walk(dist, []);
if (files.length === 0) {
  console.error(`[deploy] 错误：${dist} 里没有 JS 产物。`);
  process.exit(1);
}
const blob = files.map((file) => readFileSync(file, 'utf8')).join('\n');
if (blob.includes('import.meta.env.VITE_API_BASE')) {
  console.error('[deploy] 错误：后管产物仍保留 import.meta.env.VITE_API_BASE，Vite 没有按生产值内联。');
  process.exit(1);
}
if (!quoted.some((token) => blob.includes(token))) {
  console.error(`[deploy] 错误：后管产物里没有 ${apiBase}。生产必须走 nginx 同源 /api，不能打成本机 127.0.0.1:3000。`);
  process.exit(1);
}
if (blob.includes('http://127.0.0.1:3000/api') || blob.includes('http://localhost:3000/api')) {
  console.log('[deploy] 产物里仍有源码中的本机回退地址；已确认运行基址是 /api。');
}
EOF
  log "后管产物已就绪：${index}（$(stat -c '%y' "$index")）"
  log "无需把 dist 拷到别处。请保持 nginx 的 / 指向这个目录。"
}

note_nginx() {
  if [[ -r "$NGINX_CONF" ]]; then
    if ! grep -q 'apps/admin/dist' "$NGINX_CONF"; then
      log "警告：${NGINX_CONF} 里没有 apps/admin/dist。脚本不会改 nginx，也不会拷贝文件。"
    fi
    if ! grep -q '3000' "$NGINX_CONF"; then
      log "警告：${NGINX_CONF} 里没有 3000。API 健康检查默认仍请求 ${API_HEALTH_URL}。"
    fi
    log "已核对可读的 nginx 配置 ${NGINX_CONF}，未修改。"
  else
    log "未读取 ${NGINX_CONF}（不存在或当前用户不可读）。按约定 / 指向 apps/admin/dist，/api/ 反代到 127.0.0.1:3000。"
  fi
}

unit_installed() {
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl cat "$1" >/dev/null 2>&1 || return 1
}

print_restart_plan() {
  local unit="$1"
  local health_url="$2"
  run "${SUDO[@]}" systemctl restart "$unit"
  run "${SUDO[@]}" systemctl is-active --quiet "$unit"
  if command -v curl >/dev/null 2>&1; then
    run curl -fsS --max-time 2 -o /dev/null "$health_url"
  else
    log "将请求 ${health_url} 确认 ${unit} 已监听。"
  fi
}

wait_health() {
  local url="$1"
  local unit="$2"
  local attempt=1
  while [[ "$attempt" -le 30 ]]; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 2 -o /dev/null "$url"; then
        log "健康检查通过：${url}"
        return 0
      fi
    elif node -e 'fetch(process.argv[1], { signal: AbortSignal.timeout(2000) }).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))' "$url"; then
      log "健康检查通过：${url}"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  die "${unit} 在 30 秒内没有通过 ${url}。查看：journalctl -u ${unit} -n 80 --no-pager"
}

restart_unit() {
  local unit="$1"
  local required="$2"
  local health_url="$3"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$required" -eq 1 ]]; then
      log "将重启 ${unit}，并请求 ${health_url}。"
    else
      log "若已安装 ${unit} 将重启并请求 ${health_url}；未安装则只保留构建产物。"
    fi
    print_restart_plan "$unit" "$health_url"
    return 0
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    if [[ "$required" -eq 1 ]]; then
      die "未找到 systemctl，无法重启 ${unit}。"
    fi
    log "未找到 systemctl，跳过 ${unit}。"
    return 1
  fi
  if ! unit_installed "$unit"; then
    if [[ "$required" -eq 1 ]]; then
      die "未安装 ${unit}。可设置 TISHUASHUA_API_UNIT 对齐生产机上的单元名。"
    fi
    log "未安装 ${unit}，跳过重启。对应 dist 已构建，单元装上之后再部署一次即可拉起。"
    return 1
  fi
  run "${SUDO[@]}" systemctl restart "$unit"
  if ! "${SUDO[@]}" systemctl is-active --quiet "$unit"; then
    die "${unit} 重启后不是 active。查看：journalctl -u ${unit} -n 80 --no-pager"
  fi
  log "${unit} 为 active。"
  wait_health "$health_url" "$unit"
  return 0
}

restart_services() {
  if [[ "$ADMIN_ONLY" -eq 1 ]]; then
    log "只更新了后管静态文件，不重启 ${API_UNIT} / ${WORKER_UNIT}。"
    return 0
  fi
  restart_unit "$API_UNIT" 1 "$API_HEALTH_URL"
  if [[ "$API_ONLY" -eq 1 ]]; then
    log "按 --api-only 不重启 Worker。"
    return 0
  fi
  if ! restart_unit "$WORKER_UNIT" 0 "$WORKER_HEALTH_URL"; then
    log "Worker 单元未重启。出题和课件提炼要等 ${WORKER_UNIT} 存在并启动后才会消费队列。"
  fi
}

acquire_lock() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  if ! command -v flock >/dev/null 2>&1; then
    log "未找到 flock，本次不加部署锁。"
    return 0
  fi
  exec 9>/tmp/tishuashua-deploy.lock
  if ! flock -n 9; then
    die "另一个部署正在运行（锁：/tmp/tishuashua-deploy.lock）。"
  fi
}

cd "$ROOT"
assert_privileges
assert_clean
acquire_lock

log "仓库：${ROOT}"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "dry-run：不会 fetch、安装、构建或重启。"
fi

LOCK_BEFORE="$(hash_lock)"
ensure_pnpm
sync_git
LOCK_AFTER="$(hash_lock)"
if [[ "$DRY_RUN" -eq 1 && "$SKIP_PULL" -eq 0 ]]; then
  if [[ ! -d "$ROOT/node_modules" || ! -f "$ROOT/node_modules/.modules.yaml" ]]; then
    log "当前缺少 node_modules。正式执行会安装依赖。"
    run pnpm install --frozen-lockfile
  else
    log "正式执行时比较拉取前后的 pnpm-lock.yaml；有变化或依赖目录缺失才执行 pnpm install --frozen-lockfile。"
  fi
else
  install_deps "$LOCK_BEFORE" "$LOCK_AFTER"
fi

build_targets
if [[ "$API_ONLY" -eq 0 ]]; then
  confirm_admin_dist
  note_nginx
fi
restart_services

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "dry-run 结束。没有改动仓库。"
else
  log "部署完成：$(git_in_repo rev-parse --short HEAD) $(git_in_repo log -1 --format=%s)"
fi
