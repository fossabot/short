## Second Modification
> This repository is forked from [x-dr/short](https://github.com/x-dr/short) with modifications based on the original code.

> The original code is licensed under the MIT license. This modified version follows the same license; please retain the original author and modification author's copyright information when redistributing or modifying.

---

The latest version is v1.4.3 as of 2024/11/12.

## Introduction
A URL shortener built using Cloudflare Pages.

This project allows you to quickly and freely create a URL shortener service.<br />
Features include password protection, link management, Turnstile human verification, blacklisted domains, custom redirect pages, proxy resource response, multi-domain support, and easy configuration via environment variables.

Reliable link shortening example: [c1n.top](https://c1n.top/)

<details>
  <summary>Click here to see demo images</summary>

  Automatically switches between light and dark mode based on browser settings.

  <img src="/docs/image/A1.png">

  <img src="/docs/image/A2.png">

  <img src="/docs/image/A3.png">
</details>

## Deployment
1. Fork this project: [molikai-work/short](https://github.com/molikai-work/short).

2. Log into your [Cloudflare](https://dash.cloudflare.com/) dashboard.

3. From the account homepage, select [Workers and Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) -> `Create Application` -> `Pages` -> `Connect to Git` (for consistency, we recommend setting your display language to match this guide).

4. Select your repository, and in the `Configure Build and Deployment` section, leave all settings as default. There’s no need to modify framework presets or build commands.

5. Click `Save and Deploy` and wait for the site to build.

<details>
  <summary>6. Click here to see illustrated instructions for creating the database</summary>

  (1) Go to Cloudflare's dashboard, find `Workers and Pages` on the sidebar, and select [D1](https://dash.cloudflare.com/?to=/:account/workers/d1):
  <img src="/docs/image/B6-1.png">

  (2) In the `D1` section, click `Create Database` in the upper-right corner:
  <img src="/docs/image/B6-2.png">

  <img src="/docs/image/B6-2-2.png">

  (3) Enter a name in the `Database Name` field. The name is arbitrary, as long as it’s consistent with the binding. Location settings can be left as is (example shown):
  <img src="/docs/image/B6-3.png">

  (4) After creating the database, go to the database's `Console` and follow the main deployment guide's next step (Step 7):
  <img src="/docs/image/B6-4.png">

  <img src="/docs/image/B6-4-2.png">
</details>

7. In the database console, paste and execute the following SQLite commands to create tables.

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

8. Go to the Cloudflare Pages project dashboard, select `Settings` -> `Functions` -> `D1 Database Bindings` -> `Edit Bindings`, and add the variable name as `DB` and select your newly created D1 database.

<details>
  <summary>Click here to view illustrated instructions for binding</summary>

  (1) Open the project dashboard:
  <img src="/docs/image/B8-1.png">

  (2) Go to `Settings` -> `Functions` and scroll down:
  <img src="/docs/image/B8-2.png">

  (3) Find `D1 Database Bindings`, edit it, enter `DB` as the variable name, and select the newly created database (example shown):
  <img src="/docs/image/B8-3.png">
</details>

9. Re-deploy the project to refresh the data, and you’re all set.

## Customization
### Configuring the Database Tables
You can add entries to the `banDomain` table in Cloudflare’s D1 database to manage blacklisted domains.

Domains listed in `banDomain` cannot be used to create or resolve short links.

Simply add the top-level domain (e.g., `example.com`) to the `domain` field in the `banDomain` table, and the other fields will auto-populate.

For convenient database management and backups, consider using [JacobLinCool/d1-manager](https://github.com/JacobLinCool/d1-manager) for a visual D1 database interface.

#### Explanation of Tables
> `links` Table: Short Link Records

- id  = Unique record ID within the table
- url = Original URL for the shortened link
- slug = Unique short ID for the link
- password = Optional management password for the short link (SHA-256)
- email = Optional email address provided by the user
- ua = User’s browser identifier (note: relies on client headers and may be modified)
- ip = User’s IP address/location code
- status = Link status (`ok` for normal, `ban` for banned, `skip` to bypass blacklist)
- hostname = Hostname used when generating the link
- create_time = Creation timestamp of the short link

> `logs` Table: Short Link Access Logs

- id = Unique record ID within the table
- url = Original URL for the accessed short link
- slug = Unique short ID for the accessed link
- referer = Referrer of the access request (note: relies on client headers and may be modified)
- ua = Browser identifier of the accessing user (note: relies on client headers and may be modified)
- ip = IP address/location code of the accessing user
- status = Status following the `links` table’s configuration
- hostname = Hostname used when accessing the link
- create_time = Timestamp of the link access

> `banDomain` Table: Domain Blacklist

- id = Unique record ID within the table
- domain = Blacklisted domain
- create_time = Timestamp when the domain was added to the blacklist

### Environment Variables
You can define the following environment variables in the Cloudflare Pages dashboard under `Settings` -> `Environment Variables`.

All environment variables are optional. If not set, default values will be used without affecting normal functionality.

| Variable Name        | Example Value             | Optional | Description |
|----------------------|---------------------------|----------|-------------|
| SHORT_DOMAINS        | example.com               | Yes      | The display domain for generated short links. Defaults to the current domain if not set |
| DIRECT_DOMAINS       | example.com               | Yes      | Direct link domain; if set, this domain will use 302 redirects instead of JS redirects. Separate multiple domains with commas |
| ALLOW_DOMAINS        | example.com,example.org   | Yes      | Allowed domains for target URLs. Only these domains will be permitted as link destinations. Leave blank to disable whitelist restrictions |
| TURNSTILE_SECRET_KEY | 0x2Ba5_qET35AIiYUO-ZGHtaHc | Yes      | Secret key for Turnstile verification. Leave blank to disable Turnstile |

In the project’s `functions` folder, see `utils.js` for common functions and additional settings, such as the display name for backend short links.

### Turnstile Verification Setup
Skip this section if you have not configured the Turnstile environment variable.

If you want to enable Turnstile verification:
1. Go to the [Turnstile page](https://dash.cloudflare.com/?to=/:account/turnstile) and follow the steps to obtain your site key and secret key, then set `TURNSTILE_SECRET_KEY` in environment variables to the secret key value.
2. In the `index.html` file at the project root, set the `data-sitekey` attribute in line 47 to your site key. Optionally, uncomment the following line to enhance user awareness of the captcha.
3. In `manage.html` under the `pages` directory, set the `data-sitekey` attribute in line 57 to your site key.

### Configuring Deployment Settings

- `_headers` in the root directory<br />
Configures request response headers. See the Cloudflare Pages documentation on [Headers](https://developers.cloudflare.com/pages/configuration/headers/)

- `_redirects` in the root directory<br />
Configures redirects. See the Cloudflare Pages documentation on [

Redirects](https://developers.cloudflare.com/pages/configuration/redirects/)

- `_routes.json` in the root directory<br />
Configures routing. See the Cloudflare Pages documentation on [Routing](https://developers.cloudflare.com/pages/functions/routing/)

## API
You can use the API to create links only when Turnstile verification is disabled.

```bash
# POST request to /create
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://example.org/http"}' https://example.com/create

# Specify a slug; email and password fields are also supported
curl -X POST -H "Content-Type: application/json" -d '{"url":"https://example.org/http","slug":"example"}' https://example.com/create

```

> Response:

```json
{
    "code": 200, // Response status code
    "message": "success", // Response message
    "time": 1717431484672, // Current timestamp
    "url": "https://example.org/http", // Original URL
    "slug": "example", // Short link slug
    "link": "https://example.com/example" // Full shortened URL
}
```

## Contributing
For issues, feedback, or suggestions, please submit an `issue`. Contributions through `pull requests` are also welcome—thank you!
