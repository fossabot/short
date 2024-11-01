# 注意

> 本仓库分叉于 [https://github.com/x-dr/short](https://github.com/x-dr/short) 并且已经在源代码的基础上做了修改。

> 源代码使用 MIT 许可证进行授权，本经过二次修改的程序同源代码的许可证，二次分发或者修改时请保留原作者和修改作者的版权信息。

---

最新版本在 2024/11/01 的 v1.4.0。

---

**注意：v1.4.0 之前的版本与此版本不兼容。**

1. 在数据表中多了一个字段 `password`，如要覆盖升级，请手动在 `links` 数据表中添加新字段 `password`，类型为 `TEXT`，
你可以在控制台执行这段代码来使得旧版本更新后，数据库兼容新版本：
```sql
ALTER TABLE links
ADD COLUMN password TEXT;
```

2. 数据表 `banUrl`，已改名为 `banDomain`，同时该数据表原 `url` 字段已改名为 `domain`，
你可以在控制台执行这段代码来使得旧版本更新后，数据库兼容新版本：
```sql
ALTER TABLE banUrl RENAME TO banDomain;
ALTER TABLE banDomain RENAME COLUMN url TO domain;
```

## 介绍

一个使用 Cloudflare Pages 创建的 URL 缩短器。

支持设置密码和管理短链、使用 Turnstile 人机验证、黑名单域名管理、跳转页面配置、多域名使用，可通过环境变量快速配置。

可靠的短链示例：[https://c1n.top/](https://c1n.top/)

<details>
  <summary>点击这里查看演示图片</summary>

  可根据浏览器设置自动切换光亮、暗黑主题。

  <img src="/docs/image/A1.png">

  <img src="/docs/image/A2.png">

  <img src="/docs/image/A3.png">
</details>

### 利用 Cloudflare Pages 部署

1. Fork 分叉本项目 : [https://github.com/molikai-work/short](https://github.com/molikai-work/short)。

2. 登录到[Cloudflare](https://dash.cloudflare.com/)控制台。

3. 在帐户主页中，选择[Workers 和 Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)-> `创建应用程序` -> `Pages` -> `连接到 Git`。（Cloudflare 支持多种语言，推荐将语言显示设置为与本教程相同的语言）

4. 选择你创建的项目存储库，在 `设置构建和部署` 部分中，全部默认即可，不需要修改框架预设、构建命令等内容。

5. 点击 `保存并部署` ，稍等片刻等待网站构建完成。

<details>
  <summary>6. 点击这里查看创建数据库操作的图示</summary>

  (1) 进入 Cloudflare 的控制台，查看左侧侧边栏，选择 `Workers 和 Pages` 展开菜单后再选择 [D1](https://dash.cloudflare.com/?to=/:account/workers/d1)：
  <img src="/docs/image/B6-1.png">

  (2) 在 `D1` 页面点击右上角的 `创建数据库` 以打开创建数据库菜单：
  <img src="/docs/image/B6-2.png">

  <img src="/docs/image/B6-2-2.png">

  (3) 填写 `数据库名称` 输入框，名称随意，确保绑定是为同一个数据库即可，下方的位置选项可不选（这里已经填好，示范）：
  <img src="/docs/image/B6-3.png">

  (4) 完成数据库创建，接下来在数据库的操作页面，请点击 `控制台`，并查看主部署教程的下一步（第7步）：
  <img src="/docs/image/B6-4.png">

  <img src="/docs/image/B6-4-2.png">
</details>

7. 在数据库控制台输入框粘贴下面语句执行 `SQLite` 的命令创建表执行即可。

```sql
DROP TABLE IF EXISTS links;
CREATE TABLE IF NOT EXISTS links (
    `id` integer PRIMARY KEY NOT NULL,
    `url` text,
    `slug` text,
    `password` text,
    `email` text,
    `ua` text,
    `ip` text,
    `status` text,
    `hostname` text ,
    `create_time` DATE
);
DROP TABLE IF EXISTS logs;
CREATE TABLE IF NOT EXISTS logs (
    `id` integer PRIMARY KEY NOT NULL,
    `url` text ,
    `slug` text,
    `referer` text,
    `ua` text ,
    `ip` text ,
    `status` text,
    `hostname` text ,
    `create_time` DATE
);
DROP TABLE IF EXISTS banDomain;
CREATE TABLE IF NOT EXISTS banDomain (
    `id` INTEGER PRIMARY KEY NOT NULL,
    `domain` TEXT,
    `create_time` TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX links_index ON links(slug);
CREATE INDEX logs_index ON logs(slug);
CREATE UNIQUE INDEX banDomain_index ON banDomain(domain);
```

8. 选择部署完成项目，前往 Cloudflare Pages 项目控制面板依次点击 `设置` -> `函数` -> `D1 数据库绑定` -> `编辑绑定` ->添加变量，变量名称填写：`DB` -> D1 数据库选择 `你刚刚创建好的 D1 数据库`

<details>
  <summary>《点击这里查看绑定操作的图示》</summary>

  (1) 打开具体项目的控制台：
  <img src="/docs/image/B8-1.png">

  (2) 进入设置找到函数选项并向下拉：
  <img src="/docs/image/B8-2.png">

  (3) 找到D1数据库绑定，编辑，变量名称填 `DB`，D1 数据库选择刚刚创建的数据库（这里已经填好，示范）：
  <img src="/docs/image/B8-3.png">
</details>

9. 重新部署项目以刷新数据，完成。

### 配置数据表
你可以向 Cloudflare 的 D1 数据库的已创建短链数据库中的 `banDomain` 数据表添加数据以设置黑名单域名。

在此数据表中的域名均无法创建/解析短链。

请直接在 `banDomain` 数据表的 `domain` 项添加要加黑名单的一级域名，如 `example.com` ，其他的数据项会自动填写。

这里推荐另一个项目 [https://github.com/JacobLinCool/d1-manager](https://github.com/JacobLinCool/d1-manager)，可视化 Cloudflare 的 D1 数据库的操作，更方便的设置和备份数据表。

### 配置环境变量与信息
你可以在 Cloudflare Pages 项目控制面板 `设置` -> `环境变量` -> `制作` -> `为生产环境定义变量` 中配置以下环境变量。

所有环境变量全部都是可选配置的，不配置则执行默认的相关函数，不影响正常使用。

| 变量名称 | 示例值 | 可选 | 介绍 |
|---------|-------|------|-----|
| SHORT_DOMAINS        | example.com                | 是的 | 短链生成后的显示域名，没有变量则默认自动获取当前域名 |
| DIRECT_DOMAINS       | example.com                | 是的 | 直链域名，设置后使用该域名访问则直接 302 重定向跳转，而不是默认的 JS 跳转，多个用逗号分割，没有变量则默认不启用直链跳转 |
| ALLOW_DOMAINS        | example.com,example.org    | 是的 | 允许解析目标地址的域名白名单，设置后只能使用该域名解析目标地址，否则拒绝请求，多个用逗号分割，没有变量则默认不启用允许解析域名白名单 |
| TURNSTILE_SECRET_KEY | 0x2Ba5_qET35AIiYUO-ZGHtaHc | 是的 | Turnstile 的密钥，没有变量则默认不启用 Turnstile 验证 |

你可以在项目 `functions` 文件夹下找到 `utils.js` 文件，可以在这里浏览通用函数和部分设置信息，例如在后端的短链的显示名称。

### 配置 Turnstile 验证
如果未在环境变量中配置关于 Turnstile 密钥的环境变量，请忽略本节信息。

如果你需要开启 Turnstile 验证功能，请：
1. 在 [Turnstile 页面](https://dash.cloudflare.com/?to=/:account/turnstile)根据引导步骤申请获得站点密钥和密钥，然后配置环境变量 `TURNSTILE_SECRET_KEY` 的值为密钥内容。
2. 在项目根目录的 `index.html` 文件，将第 `47` 行的元素的 `data-sitekey` 属性设置为你的站点密钥。另外可以还取消下一行的注释以更好的提醒验证码的存在。
2. 在项目 `pages` 目录下的 `manage.html` 文件，将第 `57` 行的元素的 `data-sitekey` 属性为设置你的站点密钥。

完成。

### 数据表解释
> 表 `links` 短链记录

- id  = 行数据在数据表中的唯一记录 ID
- url = 短链的目标 URL
- slug = 短链对应的唯一短 ID
- password = 用户可选设置的短链的管理密码（SHA-256）
- email = 用户可选提交的 Email 地址
- ua = 用户的浏览器标识（注：此数据依靠客户端标头，可篡改）
- ip = 用户的 IP 地址/ IP 所属的地区代码
- status = 短链的状态，默认为 `ok`，`ban` 为封禁、`ok` 为正常、`skip` 为跳过黑名单
- hostname = 用户生成短链访问的主机名
- create_time = 短链生成时间

> 表 `logs` 短链访问记录

- id = 行数据在数据表中的唯一记录 ID
- url = 用户访问的短链的目标 URL
- slug = 访问的短链对应的唯一短 ID
- referer = 访问短链的用户来源（注：此数据依靠客户端标头，可篡改）
- ua = 访问用户的浏览器标识（注：此数据依靠客户端标头，可篡改）
- ip = 访问用户的 IP 地址/ IP 所属的地区代码
- status = 短链的状态，跟随表 `links` 的设置
- hostname = 用户访问短链所使用的主机名
- create_time = 用户访问短链的时间

> 表 `banDomain` 域名黑名单

- id = 行数据在数据表中的唯一记录 ID
- domain = 黑名单域名
- create_time = 黑名单添加时间

### 通过 API 生成
仅限未启用 Turnstile 验证的情况下可以任意使用 API 生成。

```bash
# POST 请求到 /create
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://example.com/"}' https://example.com/create

# 指定 slug，还支持 email、password
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://example.com/","slug":"example"}' https://example.com/create

```

> 响应:

```json
{
    "code": 200,
    "message": "success",
    "time": 1717431484672,
    "url": "https://example.com/",
    "slug": "example",
    "link": "https://example.com/example"
}
```

---

## 贡献
问题反馈或建议请提交 `issues`，也非常欢迎来提交 `pulls`，感谢！
