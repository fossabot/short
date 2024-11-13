/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/proxy/[id].js

import { allowProxyOrigin, createResponse, shortName, specialDomains, adminEmail } from '../utils';

// 处理代理资源短链查询的函数
export async function onRequestGet(context) {
    const { request, env, params } = context;

    // 设置跨域请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': `${allowProxyOrigin}`,
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // 获取客户端 IP、用户代理、Referer 和主机名等信息
    const clientIP = request.headers.get("CF-Connecting-IP");
    const countryIP = request.headers.get("CF-IPCountry");
    const userAgent = request.headers.get("User-Agent");
    const referer = request.headers.get('Referer');

    const originUrl = new URL(request.url);
    const origin = `${originUrl.protocol}//${originUrl.hostname}` // 获取 "请求协议//请求主机名"
    const hostName = request.headers.get("Host");

    const customOrigin = env.SHORT_DOMAINS ? `https://${env.SHORT_DOMAINS}` : origin;

    // 当前时间戳
    const formattedDate = new Date().toISOString();

    // 如果没有数据库变量
    if (!env.DB) {
        return createResponse(500, `${shortName}代理资源跳转 API 运行正常，但尚未配置数据库。`);
    }

    // 如果是 HEAD 请求
    if (request.method === 'HEAD') {
        return createResponse(405, `此代理资源跳转 API 已禁止使用 HEAD 请求。`);
    }

    if (!env.ALLOW_DOMAINS) {
        // 环境变量不存时跳过代码执行
    } else {
        // 读取环境变量允许解析域名名单
        const allowDomains = env.ALLOW_DOMAINS.split(',');
        // 如果主机名不在允许列表内，则返回 403 响应
        if (!allowDomains.includes(hostName)) {
            return createResponse(403, `请求来源主机名未授权`);
        }
    }

    const slug = decodeURIComponent(params.id); // 解码 slug 参数

    // 查询 slug 对应的 URL
    const urlQueryResult = await env.DB.prepare(`
        SELECT url AS url 
        FROM links 
        WHERE slug = ?
    `).bind(slug).first();

    // 如果未找到 URL，则 302 重定向到正常跳转
    if (!urlQueryResult) {
        return Response.redirect(`${customOrigin}/${slug}`, 302);
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

        // 如果状态不为 proxy，则进行 307 重定向到正常跳转
        if (status !== "proxy") {
            return Response.redirect(`${customOrigin}/${slug}`, 307);
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

            // 提取原 URL 的域名部分
            const urlHostnameParts = new URL(urlQueryResult.url).hostname.split('.');

            // 检查是否为 IPv4 地址
            let urlHostname = null;
            if (/^(\d{1,3}\.){3}\d{1,3}$/.test(new URL(urlQueryResult.url).hostname)) {
                urlHostname = new URL(urlQueryResult.url).hostname;
            } else {
                // 检查是否属于特定域名结尾
                for (const specialDomain of specialDomains) {
                    if (urlHostnameParts.slice(-specialDomain.split('.').length).join('.') === specialDomain) {
                        urlHostname = urlHostnameParts.join('.');
                        break;
                    }
                }

                // 如果不属于特定域名，则提取一级域名
                if (!urlHostname) {
                    urlHostname = urlHostnameParts.slice(-2).join('.');
                }
            }

            // 查询 banDomain 表是否存在该一级域名
            const banUrlQueryResult = await env.DB.prepare(`
                SELECT id AS id
                FROM banDomain 
                WHERE domain = ?
            `).bind(urlHostname).first();

            // 如果存在 banDomain 记录，则返回 403
            if (banUrlQueryResult) {
                return new Response(null, {
                    status: 403,
                });
            }

            try {
                // 发起代理请求
                const responseProxy = await fetch(urlQueryResult.url, {
                    method: "GET",
                    headers: {
                        "User-Agent": `ProxyScriptBot/1.0 (Ubuntu 22.04; Node.js/18.17; Short URL proxy service; +${customOrigin}; ${adminEmail})`,
                        "Referer": `${customOrigin}/proxy/${slug}`
                    },
                    redirect: "manual"
                });

                // 如果远程响应为 4xx 状态码则直接返回
                if (responseProxy.status >= 400 && responseProxy.status < 500) {
                    return new Response(null, {
                        status: responseProxy.status
                    });
                }

                // 允许的内容类型
                const allowedProxyContentTypes = [
                    'image/',           // 图片
                    'audio/',           // 音频
                    'video/',           // 视频
                    'text/plain',       // 纯文本
                    'application/json', // JSON
                    'application/pdf',  // PDF
                    'application/xml',  // XML
                    'text/xml'          // XML
                ];

                const proxyContentType = responseProxy.headers.get('Content-Type');

                // 检查响应是否是重定向状态码
                if (responseProxy.status > 300 && responseProxy.status < 400 && ![304, 305, 306].includes(responseProxy.status)) {
                    return new Response(null, {
                        status: 415
                    });
                }

                // 检查响应的 Content-Type 是否在允许列表内
                if (!allowedProxyContentTypes.some(type => proxyContentType && proxyContentType.startsWith(type))) {
                    return new Response(null, {
                        status: 415
                    });
                }

                // 文件扩展名映射表
                const extensionMapping = {
                    'image/jpeg': 'jpeg',
                    'image/png': 'png',
                    'image/gif': 'gif',
                    'image/webp': 'webp',
                    'audio/mpeg': 'mp3',
                    'audio/ogg': 'ogg',
                    'video/mp4': 'mp4',
                    'video/webm': 'webm',
                    'text/plain': 'txt',
                    'application/json': 'json',
                    'application/pdf': 'pdf',
                    'application/xml': 'xml',
                    'text/xml': 'xml'
                };

                // 根据 Content-Type 获取映射表对应的扩展名
                let extension = extensionMapping[proxyContentType] || '';

                // 如果没有对应扩展名，则直接使用 slug 作为文件名
                let fileName = extension ? `${slug}.${extension}` : slug;

                // 返回代理结果
                return new Response(responseProxy.body, {
                    status: responseProxy.status,
                    headers: {
                        "Content-Type": proxyContentType || 'application/octet-stream',
                        "Cache-Control": "public, max-age=259200, must-revalidate",
                        "X-Content-Type-Options": "nosniff",
                        "Content-Disposition": `${proxyContentType ? 'inline' : 'attachment'}; filename="${fileName}" filename*=UTF-8''${fileName}`
                    }
                });
            } catch (error) {
                return new Response(null, {
                    status: 500
                });
            }
        } catch (error) {
            // 错误处理
            return createResponse(500, error.message);
        }
    }
}
