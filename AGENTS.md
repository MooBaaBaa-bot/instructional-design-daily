# 每日学习内容与维护约定

面向高校 AI 教育产品经理：长期积累教育学理论，并形成可验证的产品决策。

## 每日发布

- 唯一现有执行器是 Codex「教学设计 · 每日一概念」（每天北京时间 10:00）；后续独立运行，不再读取、检查或调用 WorkBuddy；已有历史按原进度继续。
- 开始前确认工作区干净，执行 `git pull --ff-only origin main`，随后执行 `python3 scripts/publish.py next`。一天最多一篇，所有日期为 Asia/Shanghai。已发当天内容时只验证，不生成第二篇。
- 30 个概念是整期课程；第 7/14/21/28 个概念追加 weeklyReview，不是每周重新开始 7 天目录。不按日历硬补发、跳号或伪造发布日期。第 30 篇后停止新增，等待新一期规划。
- 不修改或删除 data/articles 中的历史文件。更正以 data/companions/<id>.json 添加，更新 companions/index.json。不得改变正文以免破坏旧划线。
- 保留原有 8 个章节，新文章同时提供 `learning` 对象，字段参照 data/companions/sociocultural-theory.json（不要复制案例内容）。历史兼容模式只警告缺少 learning，不代表达到新标准。
- learning 必须含 takeaway、scenario、decision、counterexample、evaluation、evidenceStatus；reflection.question/answer；related（已有概念 id）；audit.status/note；corrections 可空。
- 场景必须落到高校产品工作：角色、任务和障碍；写清功能如何回应理论机制、失败反例、适用条件、可观察学习指标。活跃率和满意度不能单独证明学习效果。
- 反思要求作出产品判断、提出实验或给出反例；参考思路默认折叠。设计案例明确标注“设计假设”，预期结果不能伪装成观察结果。
- 区分原始理论、后来发展、经验研究和 AI 设计外推。每条研究性主张在 learning.claims 中记录 claim/source/locator（页码或章节）/scope（对象及边界）/checkedAt。核对 DOI 元数据只证明书目信息；未阅读相关原文不得标为结论核验通过。
- 书目信息和全文无法核验时明确写待核验，不虚构结果。没有公认模型就不编造流程。所有 AI 效果外推需独立证据，否则只作为假设。
- `python3 scripts/validate.py draft.json`，然后 `python3 scripts/publish.py publish draft.json --dry-run`；真实发布去掉 --dry-run。试运行绝不写文件。--update 已禁用。
- 发布冲突或网络失败时不重复生成、不强推。检查远端后按报错处理；resume 仅续推已审核提交，工作区不干净则停止。

## 代码维护

保留现有牛皮纸底色与赭黄棕主题视觉、idd.records.v1 键以及 read/fav/notes/marks；新字段 practice/reviews 为增量字段。备份导入只合并缺失记录，不覆盖现有笔记。新内容须放在 article-body 外，测试历史正文渲染不变。
验证：`python3 -m unittest discover -s tests -v`、`node tests/test_records.cjs`、`node --check assets/js/app.js`；另外检查真实浏览器阅读模式、目录跳转、记录刷新保留与导入导出。

## Emilia 牛皮纸主题（2026-11-01 用户要求）

- 内页统一牛皮纸底色，主题色按首页书脊：机会库森林绿、AI 周报灰蓝、每日概念赭黄棕、技术实践酒红、产品研究奶油棕。
- `emilia-kraft.css` 为独立主题文件。内容更新保留 HTML 根元素的 `data-emilia-theme` 和 head 末尾的 `id="emilia-kraft-theme"` 样式引用，不用旧模板覆盖最新 HTML。更新前先读取远端最新版。
- 仅更新已有数据或内容区；不得为更新内容删除主题文件、重写整页或改动稳定 ID、个人记录存储键。若另有生成模板，必须保留上述主题标记与引用。
- 变更样式时更新版本参数，检查从 Emilia 书架进入的线上效果。保留首页英文书架、历史内容、搜索、筛选、收藏、练习、笔记与划线功能。
- UI 维护不修改定时任务启停、频率、内容发布时间或历史数据。发布完成后核验 Pages 和实际页面。

- 保留 Emilia 淡色植物页角、分隔花饰与细线藏书章图标（`.emilia-bookplate` / `.emilia-icon`）；花纹仅用于页头和留白，不覆盖正文。图标采用 Lucide，保留 `emilia-icons-LICENSE.txt`。

- 便签、标签与提示框使用 `--note-paper` / `--tag-paper` 暖纸色；主题色用于文字、细边框与主要操作。避免重新引入冷灰、薄荷绿、粉色的大块背景；划线保留柔和且可区分的三色。

## 内容更新必须通过的 UI 校验

- 每次先读取远端最新 main，禁止从旧聊天输出、旧模板或离线副本重建整页。
- 开始更新前与提交前均运行 `python3 scripts/check_ui.py`，必须通过。该检查固定当前主题文件、页面内嵌样式、功能脚本、样式引用、图标及导航；正文数据更新不改变基线。
- 内容任务不得修改 `ui-baseline.json`、`scripts/check_ui.py` 或受保护 UI 文件来绕过失败；失败就保留草稿并报告。仅在用户明确授权 UI 修改后，由维护流程审阅并更新基线。
- 发布只提交本次内容差异，基于最新远端提交，禁止强推。遇到并发更新重新整合并复检。
- 等待 Pages 成功，核验线上内容和主题引用；从 Emilia 五本书的原链接可进入最新内容，不需要每次改书架或新增任务。
- 日常 UI 维护不改变任务时间、启停和通知设置；用户明确要求的调度迁移按下方独立接管约定执行。

- 发布后运行 `python3 scripts/check_ui.py --online`，逐文件核验线上 UI 资产及页面样式/导航契约。失败不得报告上线已验证。


## Codex 独立接管（2026-11-01 用户确认）

- 阅读站内容更新由 Codex 独立负责。WorkBuddy 对应旧任务已暂停且没有排队或运行中的实例；后续不读取、调用或等待 WorkBuddy 的数据库、工作目录、模板、脚本或凭据，不恢复旧执行器。
- WorkBuddy 已发布的内容属于有效历史；按 GitHub 最新内容继续，不能因 Codex 无旧运行记录而重置进度、重建历史或重复发布。
- 产品研究此前没有定时更新，用户已明确授权直接新建；撤销“等待核实旧 ChatGPT 同名任务”的条件。计划为洛杉矶时间每周一 12:00，启用情况以 Codex 实际任务记录为准；本说明不代表任务已经保存或已经执行。已注册任务被正常调度时直接执行，不重复索要迁移许可。
- AI 技术实践继续手动维护，本次未为它新建日程。


## Google AI Studio 内页设计落地（2026-11-01）

- 五个内页采用 Emilia 复古刊物版式：机会索引、周报、概念笔记、实践手册与产品档案。新样式仍集中在 `emilia-kraft.css`，保留其版本引用。
- 首页 `hub.html` 与书脊入口保持不变。内页顶部仅提供“返回书架”和 Emilia 标识，不添加跨站栏目切换；站内筛选、篇目目录与记录导航保留。
- 此次只适配现有真实内容；没有接入设计原型的示例数据、模拟收藏或新的存储键。内容任务继续使用现有发布器与稳定 ID。
- 已审阅的新 UI 基线包含该导航和样式。定时内容更新须读取最新 main 并通过原 UI 检查，不能恢复旧导航或旧模板。
