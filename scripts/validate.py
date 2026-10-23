#!/usr/bin/env python3
"""校验一篇「每日一概念」文章 JSON 的结构、篇幅与来源字段。

用法：
    python3 scripts/validate.py content/drafts/learning.json
    python3 scripts/validate.py --count content/drafts/learning.json

退出码：0 通过（可能有警告）；1 未通过。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REQUIRED_SECTIONS = [
    ("concept", "今日概念"),
    ("background", "理论背景"),
    ("mechanism", "核心机制"),
    ("contrast", "概念辨析"),
    ("scenario", "教学情境示例"),
    ("ai", "与 AI 教育的连接"),
    ("reflection", "一分钟思考"),
    ("reading", "延伸阅读"),
]
REQUIRED_TOP = ["id", "day", "date", "titleZh", "titleEn", "theme", "stageId", "type", "oneLiner", "keywords", "sections"]
MIN_CHARS, MAX_CHARS = 800, 1200
PLACEHOLDERS = ("TODO", "待补充", "此处省略", "XXX", "Lorem", "……略……")
CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")

BLOCK_TEXT_FIELDS = ("text", "caption")


def count_cjk(text: str) -> int:
    return len(CJK.findall(text or ""))


def section_text(section: dict) -> str:
    chunks: list[str] = []
    for block in section.get("blocks", []):
        for field in BLOCK_TEXT_FIELDS:
            if isinstance(block.get(field), str):
                chunks.append(block[field])
        for item in block.get("items", []) or []:
            chunks.append(item if isinstance(item, str) else json.dumps(item, ensure_ascii=False))
        for row in block.get("rows", []) or []:
            chunks.append(" ".join(str(cell) for cell in row))
        if isinstance(block.get("head"), list):
            chunks.append(" ".join(str(c) for c in block["head"]))
    return "\n".join(chunks)


def body_char_count(article: dict) -> int:
    total = 0
    for section in article.get("sections", []):
        if section.get("key") == "reading":
            continue
        total += count_cjk(section_text(section))
        total += count_cjk(section.get("question", ""))
        for item in section.get("answer", []) or []:
            total += count_cjk(item)
    review = article.get("weeklyReview")
    if isinstance(review, dict):
        for block in review.get("blocks", []):
            total += count_cjk(block.get("text", ""))
    return total


def validate(article: dict, known_ids: set[str] | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    for key in REQUIRED_TOP:
        if key not in article or article[key] in (None, "", [], {}):
            errors.append(f"缺少字段：{key}")
    if errors:
        return errors, warnings

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", article["id"]):
        errors.append("id 只能使用小写字母、数字与连字符")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", article["date"]):
        errors.append("date 必须是 YYYY-MM-DD")
    if not isinstance(article["day"], int) or not 1 <= article["day"] <= 365:
        errors.append("day 必须是 1–365 的整数")
    if not isinstance(article["keywords"], list) or len(article["keywords"]) < 3:
        errors.append("keywords 至少 3 个，用于站内搜索")

    plain = article.get("plainTalk")
    if plain is None:
        warnings.append("缺少 plainTalk（一句话讲明白）：页首白话入口将不显示")
    elif not isinstance(plain, str) or not plain.strip():
        errors.append("plainTalk 必须是非空字符串")
    else:
        n = count_cjk(plain)
        if n < 20:
            warnings.append(f"plainTalk 仅 {n} 字，过短，恐难让外行听懂")
        elif n > 90:
            warnings.append(f"plainTalk 有 {n} 字，超出「一句话」的篇幅")
        for token in PLACEHOLDERS:
            if token in plain:
                errors.append(f"plainTalk 含占位文本：{token}")

    keys = [s.get("key") for s in article["sections"]]
    expected = [k for k, _ in REQUIRED_SECTIONS]
    if keys != expected:
        errors.append(f"章节顺序或数量不符：期望 {expected}，实际 {keys}")

    for (key, heading), section in zip(REQUIRED_SECTIONS, article["sections"]):
        if section.get("heading") != heading:
            warnings.append(f"章节 {key} 的标题为「{section.get('heading')}」，建议使用「{heading}」")
        if key in ("reflection", "reading"):
            continue
        if not section.get("blocks"):
            errors.append(f"章节 {key} 没有正文内容")

    for section in article["sections"]:
        blob = json.dumps(section, ensure_ascii=False)
        for token in PLACEHOLDERS:
            if token in blob:
                errors.append(f"章节 {section.get('key')} 含占位文本：{token}")

    ai = next((s for s in article["sections"] if s.get("key") == "ai"), None)
    if ai:
        variants = {b.get("variant") for b in ai.get("blocks", []) if b.get("type") == "note"}
        if "evidence" not in variants:
            warnings.append("AI 章节缺少「已有研究支持」标注，请确认是否应明确区分证据与设想")
        if "design" not in variants and "evidence" in variants:
            warnings.append("AI 章节缺少「设计设想」标注")

    refl = next((s for s in article["sections"] if s.get("key") == "reflection"), None)
    if refl and not refl.get("question"):
        errors.append("一分钟思考缺少 question")
    if refl and not refl.get("answer"):
        errors.append("一分钟思考缺少折叠的参考思路")

    reading = next((s for s in article["sections"] if s.get("key") == "reading"), None)
    items = (reading or {}).get("items", [])
    if not 1 <= len(items) <= 3:
        errors.append(f"延伸阅读需 1–3 条，当前 {len(items)} 条")
    for i, item in enumerate(items, 1):
        for field in ("authors", "year", "title", "source"):
            if not item.get(field):
                errors.append(f"延伸阅读第 {i} 条缺少 {field}")
        link = item.get("link")
        if link and not re.fullmatch(r"https?://\S+", link):
            errors.append(f"延伸阅读第 {i} 条 link 不是有效 URL")
        if not link and not (item.get("note") and re.search(r"DOI|无 DOI|图书馆|官网|未公开", item.get("note", ""))):
            warnings.append(f"延伸阅读第 {i} 条没有链接，且 note 未说明原因")

    chars = body_char_count(article)
    if chars < MIN_CHARS:
        errors.append(f"正文 {chars} 字，少于 {MIN_CHARS} 字")
    elif chars > MAX_CHARS:
        errors.append(f"正文 {chars} 字，超过 {MAX_CHARS} 字")
    elif chars < MIN_CHARS + 25 or chars > MAX_CHARS - 25:
        warnings.append(f"正文 {chars} 字，接近篇幅边界")

    if known_ids and article["id"] in known_ids:
        errors.append(f"概念 id「{article['id']}」已发布，拒绝重复发布")

    return errors, warnings


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__)
        return 1
    path = Path(args[0])
    article = json.loads(path.read_text(encoding="utf-8"))
    errors, warnings = validate(article)
    chars = body_char_count(article)

    print(f"文件：{path}")
    print(f"概念：{article.get('titleZh')}（{article.get('titleEn')}） · 第 {article.get('day')} 天")
    print(f"正文中文字数：{chars}（要求 {MIN_CHARS}–{MAX_CHARS}，不含参考文献）")
    for w in warnings:
        print(f"  [警告] {w}")
    for e in errors:
        print(f"  [错误] {e}")
    print("结果：" + ("通过" if not errors else "未通过"))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
