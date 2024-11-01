/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/[id].js

import { createResponse, shortName, htmlHead, adminEmail, noscript, specialDomains, footer } from './utils';

import html404 from '../404.html'; // 导入 404 页面

// 处理 GET 请求的函数
export async function onRequestGet(context) {
    const { request, env, params } = context;

    // 获取客户端 IP、用户代理、Referer 和主机名等信息
    const clientIP = request.headers.get("CF-Connecting-IP");
    const countryIP = request.headers.get("CF-IPCountry");
    const userAgent = request.headers.get("User-Agent");
    const referer = request.headers.get('Referer');

    const originurl = new URL(request.url);
    const origin = `${originurl.protocol}//${originurl.hostname}` // 获取 "请求协议//请求主机名"
    const hostName = request.headers.get("Host");

    let customOrigin = env.SHORT_DOMAINS ? `https://${env.SHORT_DOMAINS}` : origin;

    // 当前时间戳
    const formattedDate = new Date().toISOString();

    // 如果没有数据库变量
    if (!env.DB) {
        return createResponse(500, `${shortName}跳转处理 API 运行正常，但尚未配置数据库。`, 500);
    }

    //  如果不是 GET 请求
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createResponse(405, `${shortName}跳转处理 API 运行正常，请使用 GET 方法。`, 405);
    }

    if (!env.ALLOW_DOMAINS) {
        // 环境变量不存时跳过代码执行
    } else {
        // 读取环境变量允许解析域名名单
        const allowDomains = env.ALLOW_DOMAINS.split(',');
        // 如果主机名不在允许列表内，则返回自定义的 403 页面
        if (!allowDomains.includes(hostName)) {
            const banRedirectPage = `<!DOCTYPE html>
                <!-- 此"未授权的主机名"页面由系统自动生成 -->
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
                    <p class="contact">对此页面的处理有疑问？请联系：<a href="mailto:${adminEmail}">${adminEmail}</a>，寻求短链支持。</p>
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

    // 查询 slug 对应的 URL
    const urlQueryResult = await env.DB.prepare(`
        SELECT url AS url 
        FROM links 
        WHERE slug = ?
    `).bind(slug).first();

    // 如果未找到 URL，则返回 404 响应
    if (!urlQueryResult) {
        return new Response(html404, {
            status: 404,
            headers: {
                "content-type": "text/html;charset=UTF-8",
            }
        });
    } else {
        // 查询 slug 对应的状态
        const statusQueryResult = await env.DB.prepare(`
            SELECT status AS status 
            FROM links 
            WHERE slug = ?
        `).bind(slug).first();

        let status = null;
        if (statusQueryResult && statusQueryResult.status) {
            status = statusQueryResult.status;
        }

        // 如果状态为 proxy，则进行 307 重定向到代理
        if (status === "proxy") {
            return Response.redirect(`${customOrigin}/proxy/${slug}`, 307);
        }

        try {
            await env.DB.prepare(`
                INSERT INTO logs (url, slug, ip, status, referer, ua, hostname, create_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
                .bind(
                    urlQueryResult.url || null,
                    slug || null,
                    `${clientIP || null}/${countryIP || null}`,
                    status || null,
                    referer || null,
                    userAgent || null,
                    hostName || null,
                    formattedDate || null
                ).run();

            const banRedirectPage = `<!DOCTYPE html>
                <!-- 此"解析URL被拒绝"页面由系统自动生成 -->
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
                    <p class="contact">对此页面的处理有疑问？请联系：<a href="mailto:${adminEmail}">${adminEmail}</a>，寻求短链支持。</p>
                    ${footer}
                </body>
                </html>`;

            if (status === "skip" || status === "ban" || status === "404") {
                // 跳过代码执行
            } else {
                // 提取原 URL 的域名部分
                const urlHostnameParts = new URL(urlQueryResult.url).hostname.split('.');

                // 检查是否为 IPv4 地址
                let urlHostname = null;
                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(new URL(urlQueryResult.url).hostname)) {
                    urlHostname = new URL(urlQueryResult.url).hostname;
                } else {
                    // 检查是否属于特定域名结尾
                    for (const specialDomain of specialDomains) {
                        // 获取特定域名的部分数量
                        const specialDomainPartsCount = specialDomain.split('.').length;

                        // 检查当前 URL 的主机名是否以特定域名结尾
                        if (urlHostnameParts.slice(-specialDomainPartsCount).join('.') === specialDomain) {
                            // 如果匹配到，则提取并返回二级子域名
                            urlHostname = urlHostnameParts.slice(-specialDomainPartsCount - 1).join('.');
                            break;
                        }
                    }

                    // 如果不属于特定域名，则提取二级域名
                    if (!urlHostname) {
                        urlHostname = urlHostnameParts.slice(-2).join('.');
                    }
                }

                // 查询 banDomain 表是否存在该二级域名
                const banUrlQueryResult = await env.DB.prepare(`
                    SELECT id AS id
                    FROM banDomain 
                    WHERE domain = ?
                `).bind(urlHostname).first();

                // 如果存在 banDomain 记录，则返回 403
                if (banUrlQueryResult) {
                    return new Response(banRedirectPage, {
                        status: 403,
                        headers: {
                            "content-type": "text/html;charset=UTF-8",
                        }
                    });
                }
            }

            // 如果状态为 ban，则返回 403
            if (status === "ban") {
                return new Response(banRedirectPage, {
                    status: 403,
                    headers: {
                        "content-type": "text/html;charset=UTF-8",
                    }
                });
            }

            // 如果状态为 404，则返回 404
            if (status === "404") {
                return new Response(html404, {
                    status: 404,
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
                <!-- 此"带你到目标页面"页面由系统自动生成 -->
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
                    <p class="contact">对此目标 Url 有疑问？请联系：<a href="mailto:${adminEmail}">${adminEmail}</a>，寻求短链支持。</p>
                    ${footer}
                    <script nonce="shortJump">
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
            // 构建带错误提示的页面
            const errorRedirectPage = `<!DOCTYPE html>
                <!-- 此"似乎遇到了某些内部问题"页面由系统自动生成 -->
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
                    <p class="contact">对此目标 Url 或是页面有疑问？请联系：<a href="mailto:${adminEmail}">${adminEmail}</a>，寻求短链支持。</p>
                    <p>错误信息：</p>
                    <pre class="error-message">${error.message}</pre>
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
