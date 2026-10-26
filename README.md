# 教学设计 · 每日一概念

静态学习站点，面向高校 AI 教育产品经理。GitHub Pages 从 main 发布。

## 本次交付

7 篇历史文章保持原文件不变；新增独立实践补充，提供速览/全文/产品实践、场景—设计决策—反例—验证、可保存反思、1/7/30 天复习、关联概念和学术补注。修复 weeklyReview 未显示。读者记录沿用 idd.records.v1，导出包含全部新旧字段；导入以本机已有值为优先。

## 运行与验证

Python 3.10+、Node.js 18+，无安装依赖：

```sh
python3 -m http.server 8765
python3 -m unittest discover -s tests -v
node tests/test_records.cjs
node --check assets/js/app.js
```

## 发布与回滚

提交并推送 main 后等待 GitHub Pages 构建。检查线上 app.js 中 learningHTML、companions/index.json 以及实际页面，而不只检查 status.json：该状态的时间戳是文章发布时间，不能证明前端更新已上线。

不要改写历史文章；若本次前端需回滚，revert 本次功能提交即可。新本地记录仍保留在同一个存储键，旧前端不识别新字段，回滚前建议先导出备份。

## 自动化归属与迁移边界（2026-10-26 调查）

- WorkBuddy 中 daily learning 为 ACTIVE。配置每天 10:00，提示词指定 Asia/Shanghai；下一次时间戳换算为 2026-10-27 10:00 +08:00。未修改或停用此任务，未创建 Codex 定时任务。
- 其工作目录是用户现有 WorkBuddy 项目；与本次修改使用的 checkout 不同。原提示词没有主动拉取远端步骤，也未要求 learning 字段。因此推送代码不等于任务已升级。
- 页面最近文章时间 09:24 早于 10:00，且任务 last_run_at 为空；不能把文章元数据当作调度器已按时执行的证据。未确认此篇由定时触发还是人工补跑。
- 仓库没有原有 GitHub Actions 发布生成配置；自动测试配置保留为 docs/check-workflow.example.yml，未启用（现有 GitHub 登录缺少 workflow 权限）；它只做测试，不生成文章。
- 迁移到新执行器必须先由用户选择，确认原任务停用后再启用一个新任务。此次保留 WorkBuddy 单执行器。
- 更新原任务提示词：执行前先 `git pull --ff-only origin main`；读取 AGENTS.md；新文章必须按其中要求提供 learning 与核验记录。保留原 10:00 / Asia/Shanghai。此提示词更新尚未执行。

## 课程与证据边界

30 个概念是整期课程，7/14/21/28 是回顾节点，1/7/30 是用户选择的复习间隔，三者独立。历史日期不重排。课程计划阶段与自然周不是同一概念。

学术核验状态显式可见。本次只对 Wood、Bruner、Ross（1976）的研究对象及支架功能做了原文核对，并附上更正；其他历史主张尚未完成逐条全文核验。格式校验不能替代学术审查，新产品场景全部标为设计假设。

## 防重复与保护

发布前核查最新远端、同日重复、课程顺序和已有文章文件；同 checkout 使用进程锁，跨 checkout 依靠 Git 非强制推送拒绝冲突。--dry-run 只校验，--update 禁用，提交只纳入 data。网络失败保留状态以供人工核对，不自动强推。多文件写入中断可能需要人工检查，脚本不会覆盖已有文章进行修复。
