# AI 几何画板

这是 **AIGeoGebra** 的高保真原型

纯静态实现(`HTML + CSS + JS` 分离),**双击 `index.html` 即可在浏览器打开并直接试用**,无需安装依赖、无需启动服务器、无需联网。

> **关于打开方式**:为保证 `file://` 协议(直接双击文件)下也能正常交互,原型刻意**不使用 ES 模块**,所有脚本都是经典脚本,按依赖顺序加载并挂载到 `window.AIGGB` 命名空间(`window.AIGGB.store` / `window.AIGGB.board`)。
> 原因:浏览器会以 CORS 策略拦截 `file://` 下的 `<script type="module" src="...">` 与动态 `import()`,表现为"页面能打开但点不动"。
> 若你更习惯用本地服务器打开(如 `npx serve`),两种方式都可用,行为一致。
>
> 若曾打开过旧版本,请用 `Ctrl + F5` 强制刷新一次,避免浏览器继续使用缓存的旧脚本。

---

## 1. 如何演示(建议路径)

| 步骤 | 操作 | 看点 |
| --- | --- | --- |
| 1 | 双击打开 `index.html` | 未登录状态下的完整工作区,顶部导航右侧是「登录 / 注册」 |
| 2 | 点击任一示例按钮 | 弹出登录引导(登录后会话自动存云端 / 继续体验) |
| 3 | 选「继续体验」 | 观察完整作图流程(见下) |
| 4 | 点击第一个示例「画三角形 ABC…」 | **命令逐条执行 → 第一条失败 → 后续标记「未执行」→ 自动修正重新执行 → 显示「已自动修改并重新执行」徽章 → AI 流式中文解释** |
| 5 | 依次切换 3D / 概率 / 科学 | 四种画板形态;概率模式可改分布与区间;科学计算器按键可真实计算 |
| 6 | 打开 `login.html`(或"继续体验"后点头像 → 退出) | 登录页:演示账号 `demo@aiggb.cn` / `demo1234`,点「一键填入」→「登录」 |
| 7 | 登录后回到工作区 | 顶部显示用户菜单;每次作图会话自动同步到云端 |
| 8 | 进入 `dashboard.html` | 个人工作台:统计卡片、近 7 天用量柱状图(可悬停)、模型用量分布、会话列表 |
| 9 | 会话列表操作 | **打开**(回到工作区继续)、**重命名**、**导出 JSON**(真实下载文件)、**删除** |
| 10 | 进入 `settings.html` | 模型切换、EdgeOne AI Gateway 卡片、API Key、测试连接;账户资料与密码;数据导出 / 清空 / 删号 |

> 原型数据保存在浏览器 `localStorage`(键 `aiggb-proto-v1`)。在「设置 → 数据管理 → 清空本地缓存」可恢复到初始示例数据。

---

## 2. 页面清单

```
高保真原型/
├── index.html               # 入口:AI 几何画板工作区(四模式)
├── login.html               # 登录
├── register.html            # 注册(验证码倒计时、密码强度、协议勾选)
├── forgot-password.html     # 找回密码(三步:发邮件 → 设新密码 → 完成)
├── dashboard.html           # 个人工作台(云端会话 + 用量统计)
├── settings.html            # 设置(模型接入 / 账户 / 数据 / 关于)
├── css/
│   ├── base.css             # 设计系统:色彩、字体、按钮、表单、卡片、导航、弹层、Toast
│   ├── app.css              # 工作区:模式头部、会话区、画板区、命令日志
│   ├── board.css            # 模拟画板:工具栏、代数区、概率计算器、科学计算器
│   ├── auth.css             # 登录 / 注册 / 找回密码
│   ├── dashboard.css        # 工作台:统计卡、图表、会话列表
│   └── settings.css         # 设置:模型选项、网关卡片、数据管理
└── js/                       # 均为经典脚本(非 ES 模块),挂载到 window.AIGGB
    ├── store.js             # → AIGGB.store:模拟后端(用户/模型/会话/用量)+ 通用 UI 组件
    ├── board.js             # → AIGGB.board:模拟 GeoGebra 四种画板(SVG 场景渲染)
    ├── app.js               # 工作区交互:提交、命令执行、重试、流式输出、快捷键
    ├── auth.js              # 认证页表单校验与流程
    ├── dashboard.js         # 工作台渲染与操作
    └── settings.js          # 设置页渲染与操作
```

各页面的脚本加载顺序(写在 HTML 底部,顺序不可调换):

| 页面 | 加载顺序 |
| --- | --- |
| `index.html` | `store.js` → `board.js` → `app.js` |
| `login.html` / `register.html` / `forgot-password.html` | `store.js` → `auth.js` |
| `dashboard.html` | `store.js` → `dashboard.js` |
| `settings.html` | `store.js` → `settings.js` |

---

## 3. 原型与真实项目的对应关系

### 3.1 已完工部分:界面与交互一一对应

| 原型中的实现 | 真实项目中的对应 |
| --- | --- |
| 四模式切换、标题 / 简介 / 示例 / 占位文案 | `src/modes.ts` 的 `ModeDefinition` |
| 对话气泡、流式草稿、错误横幅、空状态 | `src/App.tsx` 的 `transcript` 区块 |
| 命令日志:状态(已执行 / 失败 / 未执行)、错误原因、结果值、对象数、一键复制 | `src/App.tsx` 的 `log` 区块、`src/types.ts` 的 `CommandResult` |
| 失败即停、后续标记「未执行」、自动修正重试、「已自动修改并重新执行」徽章 | `src/chat.ts` 的重试控制 + `src/board.ts` 的 `executeCommands` |
| 中文解释 + 公式渲染($…$ / $$…$$) | `src/markdown.ts`(marked + KaTeX);原型内用轻量解析模拟 |
| 坐标系显隐、角度 / 弧度、日志显隐、模式记忆 | `src/App.tsx` 的 `makePersisted` 偏好项 |
| Enter 提交 / Shift+Enter 换行 / Ctrl+Enter 提交 / Esc 停止 | `src/App.tsx` 的快捷键绑定 |
| 每种计算器的画板形态(几何 / 3D / 概率 / 科学) | `src/board.ts` 挂载的 GeoGebra applet;原型用 SVG 场景模拟 |

> 说明:原型里的画板是**静态 SVG 场景**而非真实 GeoGebra,用于还原界面与交互节奏;真实项目由 `deployggb.js` 加载官方画板。
> 科学计算器的按键在本原型中可真实计算(四则运算、阶乘、三角函数、对数,按当前 DEG/RAD 单位),便于演示。

### 3.2 未呈现部分:原型补齐的后端界面

| 原型界面 | 对应能力 | 真实项目现状 |
| --- | --- | --- |
| 登录 / 注册 / 找回密码 / 退出登录 | 用户系统 | **尚无**:项目当前无任何账号体系,页面直接进入工作区 |
| 云端会话列表、打开、重命名、导出、删除 | 会话管理 | **部分**:目前仅存浏览器 `localStorage`(`aiggb.sessions`);README「Roadmap」列出"多会话切换、导出/导入对话、清空全部模式数据"为待办 |
| 每次作图自动同步到云端 + 「已同步到云端」提示 | 会话持久化到账号 | **尚无**:为云端化的新增设计 |
| 工作台统计卡(累计请求 / 会话数 / Token 用量) | 可观测性 | **尚无**:README「Roadmap → 可观测性:请求耗时、Token 用量、失败率埋点」 |
| 近 7 天请求柱状图、模型用量分布 | 用量统计 | **尚无**:同上 |
| 模型选择下拉(工作区右上角) | 模型选择 UI | **尚无**:README「Roadmap → 模型选择 UI:在页面上切换模型(替代手工修改 .env)」 |
| 设置 → 模型接入:模型列表、切换、测试连接、API Key 管理 | 模型配置管理 | **部分**:模型由 `.env` 的 `LLM_MODEL` 决定,`GET /api/status` 返回配置状态 |
| EdgeOne AI Gateway 卡片(端点 / 网关模型 / 本月额度) | AI Gateway 接入 | **已有线索、待接入**:`.env` 预留了 `AI_GATEWAY_API_KEY`、`AI_GATEWAY_BASE_URL`、`AI_GATEWAY_MODEL`、`MAKERS_MODELS_KEY`,代码尚未使用 |

### 3.3 原型中模拟的后端接口

`js/store.js` 用 `localStorage` 模拟了以下接口,真实实现时替换为同名真实请求即可:

| 原型函数 | 建议的真实接口 | 说明 |
| --- | --- | --- |
| `auth.login` | `POST /api/auth/login` | 邮箱 + 密码登录,返回会话令牌 |
| `auth.register` | `POST /api/auth/register` | 昵称、邮箱、验证码、密码 |
| `auth.sendCode` | `POST /api/auth/send-code` | 发送邮箱验证码(带 60 秒重发限制) |
| `auth.resetPassword` | `POST /api/auth/reset-password` | 通过邮件令牌重置密码 |
| `auth.logout` | `POST /api/auth/logout` | 失效当前令牌 |
| `models.status` | `GET /api/status` | **真实项目已有**(`functions/api/status.js`),返回 `{ configured, model }` |
| `models.set` | `PATCH /api/settings/model` | 保存用户的默认模型(替代手改 `.env`) |
| `models.testConnection` | `POST /api/models/test` | 服务端代发一次最小请求,回传延迟 |
| `sessions.list/get/add/update/remove` | `GET/POST/PATCH/DELETE /api/sessions` | 云端会话 CRUD |
| `sessions.export` | `GET /api/sessions/:id/export` | 导出为 JSON |
| `usage.get` | `GET /api/usage` | 用量统计(可由 EdgeOne AI Gateway 侧统计) |
| —— | `POST /llm/chat/completions` | **真实项目已有**:同源转发代理,密钥不落前端 |

原型的 LLM 对话链路(流式输出、命令工具调用、失败重试)在 `js/app.js` 中按 `src/chat.ts` → `src/board.ts` 的真实执行顺序复刻,只是把网络流换成了本地数据。

---

## 4. 演示数据说明

- **演示账号**:`demo@aiggb.cn` / `demo1234`(原型中任意合法邮箱 + 6 位以上密码也可登录;注册需走完整校验规则)。
- **预置会话**:三条示例会话(几何"三角形与高"、概率"标准正态概率"、3D"棱锥"),便于直接查看工作台。
- **用量数据**:近 7 天 14/22/9/26/17/31/21 次请求、按模型分布、累计 328 次 / 1.24M Token——均为演示数据。
- **会话同步**:登录后在工作区完成的每次作图会自动创建/更新一条云端会话,可在工作台看到。

---

## 5. 设计说明

- 沿用真实项目的设计语言:米白纸面(`#efeae2`)、深青品牌色(`#0c5c56`)、衬线标题 + 无衬线正文,与 `src/styles.css` 一致。
- 四种模式各有专属徽章色(几何·深青 / 3D·靛蓝 / 概率·赭黄 / 科学·橄榄),在日志、会话列表、图表中保持一致。
- 工作台图表遵循单色系原则:主线深青、辅助色取自同一色板,细标记、基线对齐、数值直接标注,悬停显示明细。
- 响应式:窄屏(< 860px)自动切换为单栏;认证页在窄屏下收起品牌区。

---

## 6. 边界说明

- 本目录**只包含原型**,不参与 `npm run build`,也不影响真实项目的任何代码、依赖或构建产物。
- 原型中的所有"后端"行为均为前端模拟,数据仅存于浏览器本地,不产生任何真实网络请求、不涉及真实密钥(设置页展示的 API Key 为演示占位)。
- 真实项目的部署与运行方式请见仓库根目录的 `README.md`。
