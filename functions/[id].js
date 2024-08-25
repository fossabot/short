/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/[id].js

import { shortName, htmlHead, adminEmail, noscript, footer } from './utils';

import html404 from '../404.html';

// 处理 GET 请求的函数
export async function onRequestGet(context) {
    const { request, env, params } = context;

    const clientIP = request.headers.get("CF-Connecting-IP");
    const userAgent = request.headers.get("User-Agent");
    const referer = request.headers.get('Referer');
    const hostName = request.headers.get("Host");

    const formattedDate = new Date().toISOString();

    if (!env.ALLOW_DOMAINS) {
        // 环境变量不存时跳过代码执行
    } else {
        // 读取环境变量允许解析域名名单
        const allowDomains = env.ALLOW_DOMAINS.split(',');
        // 如果主机名不在允许列表内
        if (!allowDomains.includes(hostName)) {
            const banRedirectPage = `<!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                    <title>${shortName} - 未授权的主机名</title>
                    ${htmlHead}
                </head>
                <body>
                    <h2>${shortName} - 403错误</h2>
                    <h1>未授权的主机名</h1>
                    <p>您访问的 URL 中，考虑防滥用，主机名尚未被授权解析目标地址。</p>
                    <a href="/">返回主页</a>
                    <br /><br />
                    <p class="contact">对此页面的处理有疑问？请联系：<a href="mailto:${adminEmail}?subject=Feedback...&body=Hello...">${adminEmail}</a>，寻求短链支持。</p>
                    ${footer}
                </body>
                </html>`;

            return new Response(banRedirectPage, {
                status: 403,
                headers: {
                    "content-type": "text/html;charset=UTF-8",
                }
            });
        }
    }

    const slug = decodeURIComponent(params.id); // 解码 slug 参数

    // 查询 slug 对应的状态
    const statusQueryResult = await env.DB.prepare(`
        SELECT status AS status 
        FROM links 
        WHERE slug = ?
    `).bind(slug).first();

    // 查询 slug 对应的 URL
    const urlQueryResult = await env.DB.prepare(`
        SELECT url AS url 
        FROM links 
        WHERE slug = ?
    `).bind(slug).first();

    let status = null;
    if (statusQueryResult && statusQueryResult.status) {
        status = statusQueryResult.status;
    }

    // 如果未找到 URL，则返回 404 响应
    if (!urlQueryResult) {
        return new Response(html404, {
            status: 404,
            headers: {
                "content-type": "text/html;charset=UTF-8",
            }
        });
    } else {
        try {
            await env.DB.prepare(`
                INSERT INTO logs (url, slug, ip, status, referer, ua, hostname, create_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
                urlQueryResult.url || null,
                slug || null,
                clientIP || null,
                status || null,
                referer || null,
                userAgent || null,
                hostName || null,
                formattedDate || null
            ).run();

            const banRedirectPage = `<!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                    <title>${shortName} - 解析 URL 被拒绝</title>
                    ${htmlHead}
                </head>
                <body>
                    <h2>${shortName} - 403错误</h2>
                    <h1>解析 URL 被拒绝</h1>
                    <p>抱歉，我们已理解您的请求，但您被服务器拒绝了。</p>
                    <p class="warning">注意，此短链指向的目标页面可能含有违规内容。</p>
                    <a href="/">返回主页</a>
                    <br /><br />
                    <p class="contact">对此页面的处理有疑问？请联系：<a href="mailto:${adminEmail}?subject=Feedback...&body=Hello...">${adminEmail}</a>，寻求短链支持。</p>
                    ${footer}
                </body>
                </html>`;

            if (status === "skip") {
                // 跳过代码执行
            } else {
                // 提取 URL 的一级域名部分
                const urlHostname = new URL(urlQueryResult.url).hostname.split('.').slice(-2).join('.');

                // 查询 banUrl 表是否存在该一级域名
                const banUrlQueryResult = await env.DB.prepare(`
                    SELECT id AS id
                    FROM banUrl 
                    WHERE url = ?
                `).bind(urlHostname).first();

                // 如果存在 banUrl 记录，则返回 403
                if (banUrlQueryResult) {
                    // 重置目标链接为空
                    urlQueryResult.url = null;

                    return new Response(banRedirectPage, {
                        status: 403,
                        headers: {
                            "content-type": "text/html;charset=UTF-8",
                        }
                    });
                }
            }

            // 如果状态为 ban，则返回自定义的 403 页面
            if (status === "ban") {
                // 重置目标链接为空
                urlQueryResult.url = null;

                return new Response(banRedirectPage, {
                    status: 403,
                    headers: {
                        "content-type": "text/html;charset=UTF-8",
                    }
                });
            }

            // 检查环境变量是否存在
            if (!env.DIRECT_DOMAINS) {
                // 环境变量不存时跳过代码执行
            } else {
                // 如果是直链域名，则进行 302 重定向
                const directDomains = env.DIRECT_DOMAINS.split(',');

                if (directDomains.includes(hostName)) {
                    return Response.redirect(`${urlQueryResult.url}`, 302);
                }
            }

            // 构建带自动跳转的页面
            const redirectPage = `<!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                    <title>${shortName} - 带你到目标页面: 由 #${slug} 跳转</title>
                    ${htmlHead}
                </head>
                <body>
                    <h2><a href="/" title="${shortName}首页" style="text-decoration: none; color: inherit; font-size: inherit;">${shortName}</a></h2>
                    <h1>带你到目标页面</h1>
                    <p>状态：正常</p>
                    <p>这将在 <span id="countdown"></span> 秒后自动跳转。<br />如果页面没有自动跳转，请点击此链接：</p>
                    <a href="${urlQueryResult.url}" rel="external nofollow noopener noreferrer" style="word-wrap:break-word;overflow-wrap:break-word;white-space:normal;">${urlQueryResult.url}</a>
                    ${noscript}
                    <p class="contact">对此目标 Url 有疑问？请联系：<a href="mailto:${adminEmail}?subject=Feedback...&body=Hello...">${adminEmail}</a>，寻求短链支持。</p>
                    ${footer}
                    <script>
                        const targetTime = Date.now() + 3000;
                        function updateCountdown() {
                            const currentTime = Date.now();
                            const remainingTime = Math.max(targetTime - currentTime, 0);
                            const seconds = Math.ceil(remainingTime / 1000);
                            document.getElementById('countdown').innerText = seconds;
                            if (remainingTime > 0) {
                                setTimeout(updateCountdown, 1000);
                            } else {
                                var newLink = document.createElement('a');
                                newLink.setAttribute('href', "${urlQueryResult.url}");
                                newLink.setAttribute('rel', 'external nofollow noopener noreferrer');
                                newLink.click();
                            }                            
                        }
                        updateCountdown();
                    </script>
                </body>
                </html>`

            return new Response(redirectPage, {
                status: 200,
                headers: {
                    "content-type": "text/html;charset=UTF-8",
                }
            });
        } catch (error) {
            console.log(error);

            // 构建带错误提示的页面
            const errorRedirectPage = `<!DOCTYPE html>
                <html lang="zh-CN">
                <head>
                    <title>${shortName} - 似乎遇到了某些内部问题</title>
                    ${htmlHead}
                </head>
                <body>
                    <h2>${shortName} - 500错误</h2>
                    <h1>发生内部错误</h1>
                    <p>某些内部函数可能未正常执行，但我们仍会尝试解析目标地址。</p>
                    <p>这不是您的问题，是我们。<br />请向我们报告问题，然后等待我们排查错误。</p>
                    <p><span class="warning">注意，错误情况下展示的链接很可能未经过安全检查。</span><br />然后点击此链接：<a href="${urlQueryResult?.url || '#'}" rel="external nofollow noopener noreferrer">${urlQueryResult?.url || '[无法获取链接信息]'}</a>，以进行跳转。</p>
                    <p>或者<a href="/">返回主页</a>。</p>
                    <br />
                    <p class="contact">对此目标 Url 或是页面有疑问？请联系：<a href="mailto:${adminEmail}?subject=Feedback...&body=Hello...">${adminEmail}</a>，寻求短链支持。</p>
                    <p>错误信息：</p>
                    <pre style="white-space:pre-wrap;word-wrap:break-word;background-color:#f8d7da;color:#721c24;padding:10px;border:1px solid #f5c6cb;border-radius:4px;">${error.message}</pre>
                </body>
                </html>`;

            return new Response(errorRedirectPage, {
                status: 500,
                headers: {
                    "content-type": "text/html;charset=UTF-8",
                }
            });
        }
    }
}
