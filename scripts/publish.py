#!/usr/bin/env python3
"""「教学设计 · 每日一概念」发布工具。

子命令
    next                         输出下一篇待发布概念（JSON）
    status                       输出当前发布状态（JSON）
    verify                       检查线上 status.json 是否与仓库一致
    publish <article.json>       校验并通过后写入 data/、提交、推送、验证线上生效

常用参数
    --dry-run                    只做校验，不写入、不提交、不推送
    --update                     已停用；历史文章不可覆盖
    --backfill                   允许文章日期早于今天（用于补录，需显式指定）
    --no-verify                  跳过线上验证（仅用于本地预览，正式发布不要用）

退出码
    0  成功
    2  校验未通过
    3  提交或推送失败
    4  已推送，但线上在等待窗口内未确认（不视为成功）
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import body_char_count, validate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ARTICLES = DATA / "articles"
SITE_URL = os.environ.get("SITE_URL", "https://moobaabaa-bot.github.io/instructional-design-daily/")
TZ = timezone(timedelta(hours=8))
VERIFY_TIMEOUT = int(os.environ.get("VERIFY_TIMEOUT", "360"))
VERIFY_INTERVAL = int(os.environ.get("VERIFY_INTERVAL", "15"))


# ---------------------------------------------------------------- 基础

def now() -> datetime:
    return datetime.now(TZ)


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def today_str() -> str:
    return now().strftime("%Y-%m-%d")


def load(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def say(msg: str) -> None:
    print(f"[{now().strftime('%H:%M:%S')}] {msg}", flush=True)


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)


# ---------------------------------------------------------------- 计划与状态

def curriculum() -> dict:
    data = load(DATA / "curriculum.json")
    if data is None:
        raise SystemExit("缺少 data/curriculum.json")
    return data


def index() -> dict:
    return load(DATA / "index.json", {"site": "", "articles": []})


def status() -> dict:
    data = load(DATA / "status.json")
    if data is None:
        raise SystemExit("缺少 data/status.json")
    return data


def published_ids() -> set[str]:
    return {a["id"] for a in index()["articles"]}


def next_concept() -> dict | None:
    done = published_ids()
    pending = [c for c in curriculum()["concepts"] if c["id"] not in done]
    pending.sort(key=lambda c: c["day"])
    return pending[0] if pending else None


def cmd_next(_args) -> int:
    c = next_concept()
    if not c:
        print(json.dumps({"done": True, "message": "30 天目录已全部发布"}, ensure_ascii=False, indent=2))
        return 0
    last = index()["articles"][0] if index()["articles"] else None
    payload = {
        "done": False,
        "today": today_str(),
        "alreadyPublishedToday": bool(last and last["date"] == today_str()),
        "lastPublished": last,
        "concept": c,
        "stage": next((s for s in curriculum()["stages"] if s["id"] == c["stageId"]), None),
        "alreadyPublished": sorted(published_ids()),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_status(_args) -> int:
    print(json.dumps(status(), ensure_ascii=False, indent=2))
    return 0


# ---------------------------------------------------------------- 重复内容检查

def similarity_check(article: dict) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    for item in index()["articles"]:
        if item["id"] == article["id"]:
            continue
        if item["titleZh"] == article["titleZh"]:
            errors.append(f"标题与已发布内容重复：{item['titleZh']}（{item['date']}）")
        ratio = SequenceMatcher(None, item.get("oneLiner", ""), article["oneLiner"]).ratio()
        if ratio >= 0.9:
            errors.append(f"一句话概括与「{item['titleZh']}」过于接近（相似度 {ratio:.2f}）")
        elif ratio >= 0.75:
            warnings.append(f"一句话概括与「{item['titleZh']}」相似度较高（{ratio:.2f}），请确认角度确有区别")
    return errors, warnings


# ---------------------------------------------------------------- 发布

def cmd_publish(args) -> int:
    src = Path(args.article).resolve()
    if not src.exists():
        print(f"找不到文件：{src}")
        return 2
    if args.update:
        say("--update 已停用：历史文章不可覆盖；更正请新增独立补注。")
        return 2
    if not args.dry_run:
        if git("branch", "--show-current").stdout.strip() != "main":
            say("发布必须在 main 分支执行。")
            return 3
        dirty = git("status", "--porcelain", "--untracked-files=no").stdout.strip()
        if dirty:
            say("工作区存在已跟踪文件改动，请先处理；拒绝混入发布。")
            return 3
        fetch = git("fetch", "origin", "main")
        if fetch.returncode or git("rev-parse", "HEAD").stdout.strip() != git("rev-parse", "origin/main").stdout.strip():
            say("无法确认远端或本地不是最新 main；请先同步，再重新运行 next。")
            return 3
    article = load(src)
    known = published_ids()
    idx = index()
    st = status()
    today = today_str()

    errors, warnings = validate(article, known_ids=known)
    if errors:
        for error in errors: say(f"错误：{error}")
        return 2
    dup_err, dup_warn = similarity_check(article)
    errors += dup_err
    warnings += dup_warn

    if (ARTICLES / f"{article['id']}.json").exists():
        errors.append("文章文件已存在，禁止覆盖（即使索引未包含它）")
    planned = next((c for c in curriculum()["concepts"] if c["id"] == article["id"]), None)
    if not planned or any(article.get(k) != planned.get(k) for k in ("day", "stageId", "titleZh", "titleEn")):
        errors.append("文章与 curriculum 的概念、序号或阶段不一致")
    nxt = next_concept()
    if nxt and article['id'] != nxt['id'] and not args.backfill:
        errors.append("必须按课程顺序发布下一概念")
    if article.get("date", "") > today:
        errors.append("不允许发布未来日期")
    if article.get("date") and article["date"] != today and not args.backfill:
        errors.append(f"文章日期 {article['date']} 不是今天（{today}）；如确需补录请加 --backfill")
    same_day = [a for a in idx["articles"] if a["date"] == article.get("date")]
    if same_day and not args.update:
        errors.append(
            f"{article['date']} 已发布过「{same_day[0]['titleZh']}」；同一天默认只发布一篇，"
            "历史内容不可替换，请新增独立补注"
        )

    for w in warnings:
        say(f"警告：{w}")
    if errors:
        for e in errors:
            say(f"错误：{e}")
        say("校验未通过，未写入任何内容文件，已发布内容保持不变。")
        return 2

    chars = body_char_count(article)
    article.setdefault("meta", {})
    article["meta"]["wordCount"] = chars
    article["meta"]["updatedAt"] = iso(now())
    article["meta"].setdefault("publishedAt", iso(now()))
    article["meta"]["generatedBy"] = article["meta"].get("generatedBy", "WorkBuddy 每日自动化")
    article["readingMinutes"] = max(5, min(8, round(chars / 200)))
    article["wordCount"] = chars

    stage = next((s for s in curriculum()["stages"] if s["id"] == article["stageId"]), None)
    if stage is None:
        say(f"错误：stageId「{article['stageId']}」不在 curriculum.json 中")
        return 2
    if stage["theme"] != article["theme"]:
        say(f"警告：主题「{article['theme']}」与阶段主题「{stage['theme']}」不一致")

    if args.dry_run:
        say("校验通过；--dry-run 未写入任何文件、未提交、未推送。")
        return 0

    # 1. 文章文件（先写新文件，成功后才动索引）
    ARTICLES.mkdir(parents=True, exist_ok=True)
    target = ARTICLES / f"{article['id']}.json"
    with target.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(article, ensure_ascii=False, indent=2) + "\n")
    say(f"已写入文章：data/articles/{article['id']}.json（正文 {chars} 字，约 {article['readingMinutes']} 分钟）")

    # 2. 索引
    entry = {
        "id": article["id"],
        "day": article["day"],
        "date": article["date"],
        "titleZh": article["titleZh"],
        "titleEn": article["titleEn"],
        "theme": article["theme"],
        "stageId": article["stageId"],
        "type": article["type"],
        "readingMinutes": article["readingMinutes"],
        "wordCount": chars,
        "oneLiner": article["oneLiner"],
        "keywords": article["keywords"],
        "file": f"data/articles/{article['id']}.json",
        "sourceCount": len(next((s for s in article["sections"] if s["key"] == "reading"), {}).get("items", [])),
        "updatedAt": article["meta"]["updatedAt"],
    }
    idx["articles"] = [a for a in idx["articles"] if a["id"] != article["id"]] + [entry]
    idx["articles"].sort(key=lambda a: (a["date"], a["day"]), reverse=True)
    idx["count"] = len(idx["articles"])
    idx["generatedAt"] = iso(now())
    dump(DATA / "index.json", idx)
    say(f"索引已更新：共 {idx['count']} 篇")

    # 3. 学习计划中的状态
    cur = curriculum()
    for c in cur["concepts"]:
        if c["id"] == article["id"]:
            c["status"] = "published"
            c["publishedDate"] = article["date"]
    dump(DATA / "curriculum.json", cur)

    # 4. 站点状态
    nxt = next_concept()
    st.update({
        "lastPublishedAt": iso(now()),
        "lastPublishedDate": article["date"],
        "lastConceptId": article["id"],
        "lastConceptTitle": f"{article['titleZh']}（{article['titleEn']}）",
        "lastDay": article["day"],
        "publishedCount": idx["count"],
        "totalPlanned": cur.get("totalPlanned", cur.get("totalDays", 30)),
        "nextConceptId": nxt["id"] if nxt else None,
        "nextConceptTitle": f"{nxt['titleZh']}（{nxt['titleEn']}）" if nxt else None,
        "deployVerifiedAt": None,
    })
    st.setdefault("schedule", {
        "timezone": "Asia/Shanghai",
        "startTime": "10:00",
        "note": "10:00 是任务启动时间，生成与部署需要数分钟，定时服务也可能延迟。",
    })
    st.setdefault(
        "deployNote",
        "内容由定时任务写入 data/ 后提交仓库，GitHub Pages 重建后生效；页面只读取已提交的数据。",
    )
    dump(DATA / "status.json", st)
    say(f"状态已更新：第 {article['day']} 天 · {article['titleZh']}（{article['titleEn']}）")

    # 草稿位清空（保留 data/articles 唯一副本）
    if src.parent.name == "drafts":
        src.unlink(missing_ok=True)
        say("草稿已归档到 data/articles/，drafts 中的临时文件已移除")

    if args.dry_run:
        say("--dry-run：未提交、未推送。")
        return 0

    # 5. 提交与推送
    git("add", "data")
    commit = git("commit", "-m", f"content: day {article['day']} {article['titleZh']}（{article['titleEn']}）")
    if commit.returncode != 0 and "nothing to commit" not in (commit.stdout + commit.stderr):
        say(f"提交失败：{commit.stderr.strip()}")
        return 3
    push = git("push", "origin", "HEAD:main")
    if push.returncode != 0:
        say(f"推送失败：{push.stderr.strip()}")
        say("本地已提交但未推送；修复网络或权限后重试 push 即可，无需重新生成内容。")
        return 3
    say("已推送到 GitHub（main）")

    if args.no_verify:
        say("已跳过线上验证（--no-verify）。部署结果未确认，请不要对外声称已生效。")
        return 0

    # 6. 线上验证
    say(f"等待 GitHub Pages 生效，最长 {VERIFY_TIMEOUT} 秒 …")
    if not wait_online(st["lastPublishedAt"]):
        say("线上在等待窗口内未确认新版本；推送已成功，但部署未验证，请查看仓库 Actions / Pages 状态。")
        return 4

    st["deployVerifiedAt"] = iso(now())
    dump(DATA / "status.json", st)
    git("add", "data/status.json")
    git("commit", "-m", "chore: record deploy verification")
    git("push", "origin", "HEAD:main")
    say(f"线上已确认：{SITE_URL}")
    return 0


def fetch_json(url: str) -> dict | None:
    try:
        req = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "idd-publish/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def wait_online(expected: str) -> bool:
    deadline = time.time() + VERIFY_TIMEOUT
    url = SITE_URL.rstrip("/") + f"/data/status.json?cb={int(time.time())}"
    while time.time() < deadline:
        remote = fetch_json(SITE_URL.rstrip("/") + f"/data/status.json?cb={int(time.time())}")
        if remote and remote.get("lastPublishedAt") == expected:
            return True
        time.sleep(VERIFY_INTERVAL)
        url = SITE_URL.rstrip("/") + f"/data/status.json?cb={int(time.time())}"
    return False


def cmd_resume(_args) -> int:
    """上一次运行中断后继续：补提交、补推送、补验证，不重新生成内容。"""
    st = status()
    dirty = git("status", "--porcelain").stdout.strip()
    if dirty:
        say("存在未提交文件；请人工核对并提交后再 resume，避免带入无关改动。")
        return 3
    if git("fetch", "origin", "main").returncode:
        say("无法读取远端，未执行续推。")
        return 3
    if git("merge-base", "--is-ancestor", "origin/main", "HEAD").returncode:
        say("远端存在新提交，请先处理分歧，禁止自动覆盖。")
        return 3

    ahead = git("rev-list", "--count", "origin/main..HEAD").stdout.strip()
    if ahead and ahead != "0":
        push = git("push", "origin", "HEAD:main")
        if push.returncode != 0:
            say(f"推送仍失败：{push.stderr.strip()}")
            return 3
        say(f"已补推送 {ahead} 个提交")
    else:
        say("本地与远端一致，无需补推送")

    if not st.get("lastPublishedAt"):
        say("没有可验证的发布记录")
        return 4
    say(f"等待线上确认 {st['lastPublishedAt']} …")
    if not wait_online(st["lastPublishedAt"]):
        say("线上仍未确认该版本；请检查 Pages 构建状态。")
        return 4
    if not st.get("deployVerifiedAt"):
        st["deployVerifiedAt"] = iso(now())
        dump(DATA / "status.json", st)
        git("add", "data/status.json")
        git("commit", "-m", "chore: record deploy verification")
        git("push", "origin", "HEAD:main")
    say(f"线上已确认：{SITE_URL}")
    return 0


def cmd_verify(_args) -> int:
    local = status()
    remote = fetch_json(SITE_URL.rstrip("/") + f"/data/status.json?cb={int(time.time())}")
    if not remote:
        say(f"无法读取线上 status.json（{SITE_URL}）")
        return 4
    same = remote.get("lastPublishedAt") == local.get("lastPublishedAt")
    print(json.dumps({
        "site": SITE_URL,
        "localLastPublishedAt": local.get("lastPublishedAt"),
        "remoteLastPublishedAt": remote.get("lastPublishedAt"),
        "inSync": same,
        "remotePublishedCount": remote.get("publishedCount"),
    }, ensure_ascii=False, indent=2))
    return 0 if same else 4


def main() -> int:
    parser = argparse.ArgumentParser(description="每日一概念发布工具")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("next").set_defaults(func=cmd_next)
    sub.add_parser("status").set_defaults(func=cmd_status)
    sub.add_parser("verify").set_defaults(func=cmd_verify)
    sub.add_parser("resume").set_defaults(func=cmd_resume)

    p = sub.add_parser("publish")
    p.add_argument("article")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--update", action="store_true")
    p.add_argument("--backfill", action="store_true")
    p.add_argument("--no-verify", action="store_true")
    p.set_defaults(func=cmd_publish)

    args = parser.parse_args()
    if args.cmd in ("publish", "resume"):
        lock_path = ROOT / ".git" / "daily-publish.lock"
        with lock_path.open("w") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                say("另一个发布进程正在运行；本次退出。")
                return 3
            return args.func(args)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
