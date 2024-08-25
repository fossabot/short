/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/create.js

import { createResponse, htmlCorsHeaders, shortName, hashPassword } from './utils';

import html403 from '../403.html';

// 生成随机字符串 slug
function generateRandomString(length) {
    const characters = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';

    // 将随机的首字符固定为 - 以区分随机和自定义
    result += "-";

    for (let i = 1; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }

    return result;
}

// 处理创建短链接的请求
export async function onRequest(context) {
    // 设置跨域请求
    if (context.request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    const { request, env } = context;
    const clientIP = request.headers.get("CF-Connecting-IP");
    const userAgent = request.headers.get("User-Agent");

    const originurl = new URL(request.url);
    const origin = `${originurl.protocol}//${originurl.hostname}`
    const hostName = equest.headers.get("Host");

    const formattedDate = new Date().toISOString();

    // 如果请求的主机名不是原 API 的主机名
    if (!env.SHORT_DOMAINS) {
        // 环境变量不存时跳过代码执行
    } else if (hostName !== `${env.SHORT_DOMAINS}`) {
        // 返回 403 响应
        return new Response(html403, {
            headers: htmlCorsHeaders,
            status: 403
        });
    }

    // 如果是 GET 请求
    if (context.request.method === 'GET') {
        return createResponse(200, `${shortName} API 运行正常，请使用 POST 方法创建短链。`, 200);
    }

    // 从 JSON 数据中解构出进入参数
    const { url, slug, password, email, turnstileToken } = await request.json();

    // 开始进入参数检查
    // 1. 必须有 URL 参数 ------------------------------
    if (!url) {
        return createResponse(422, '请填写你要缩短的 URL', 422);
    }

    // 2. URL 必须符合要求 ------------------------------
    // url 格式检查
    if (!/^(https?):\/\/.{3,}/.test(url)) {
        return createResponse(422, 'URL 格式不合规范', 422);
    }

    // 3. URL 的顶级域名必须允许 ------------------------------
    const levelDomain = new URL(url).hostname.split('.').pop();
    // 检查顶级域名是否允许
    if (levelDomain === 'gov' || levelDomain === 'edu') {
        return createResponse(403, '包含禁止缩短的顶级域名', 403);
    }

    // 4. 自定义的 Slug 必须符合要求 ------------------------------
    // /^\..+|[^.\w\u4E00-\u9FA5\U3400-\U4DBF]|\..+\.[a-zA-Z]+$|(\.[a-zA-Z]+)$|(\.)$|\.+[a-zA-Z]/
    if (slug && (slug.length < 4 || slug.length > 9 || !/^(?!\.)[a-zA-Z0-9\u4e00-\u9fa5\u3400-\u4dbf]+(\.(?![a-zA-Z])[a-zA-Z0-9\u4e00-\u9fa5\u3400-\u4dbf]+)*$/.test(slug))) {
        return createResponse(422, 'Slug 4-9位且不能以点开头或结束、含有部分特殊字符和扩展名', 422);
    }

    // 5. 如果有 Password 那么必须符合要求 ------------------------------
    // Password 格式检查
    if (password && !/^(?=.*[a-zA-Z])(?=.*[0-9@#$%&])[a-zA-Z0-9@#$%&]{6,12}$/.test(password)) {
        return createResponse(422, '密码 6-12位且大小写字母和数字或部分特殊符号必须包含其中两项', 422);
    }

    // 6. 如果有 Email 那么必须符合要求 ------------------------------
    // Email 格式检查
    if (email && !/^[\w\.-]+@[a-zA-Z\d\.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return createResponse(422, 'Email 格式不合规范', 422);
    }

    // 7. 必须通过人机验证 ------------------------------
    if (!turnstileToken && env.TURNSTILE_SECRET_KEY) {
        return createResponse(403, '需要完成验证码才能创建短链', 403);
    }

    if (!turnstileToken || !env.TURNSTILE_SECRET_KEY) {
        // 环境变量不存时跳过代码执行
    } else {
        // 验证 Turnstile 令牌
        const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                secret: env.TURNSTILE_SECRET_KEY,
                response: turnstileToken,
                remoteip: clientIP
            })
        });
        const turnstileResult = await turnstileResponse.json();

        if (!turnstileResult.success) {
            return createResponse(403, '验证码验证失败，请刷新重试', 403);
        }
    }

    // 8. 必须通过黑名单检查 ------------------------------
    // 特定域名列表
    const specialDomains = ["eu.org", "us.kg", "pp.ua"];

    // 提取原 URL 的域名部分
    const urlHostnameParts = new URL(url).hostname.split('.');

    // 检查是否属于特定域名
    let urlHostname;
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

    // 查询 banUrl 表是否存在该域名
    const banUrlQueryResult = await env.DB.prepare(`
        SELECT id AS id
        FROM banUrl 
        WHERE url = ?
    `).bind(urlHostname).first();

    // 如果存在 banUrl 记录，则返回 403
    if (banUrlQueryResult) {
        return createResponse(403, '此链接域名在禁止缩短名单中', 403);
    }
    // 进入参数检查结束

// ...

    // 调用函数生成唯一随机 Slug
    async function generateUniqueSlug(env, initialLength = 5) {
        let slugLength = initialLength;
        let uniqueSlugFound = false;
        let generatedSlug;

        while (!uniqueSlugFound) {
            // 生成随机 Slug
            generatedSlug = generateRandomString(slugLength);

            // 查询数据库中是否存在相同的 Slug
            const existingSlugQuery = await env.DB.prepare(`SELECT slug FROM links WHERE slug = ?`).bind(generatedSlug).first();
    
            if (!existingSlugQuery) {
                uniqueSlugFound = true; // 找到唯一的 slug
            } else {
                slugLength += 1; // 增加 slug 的长度并再次生成
            }
        }

        return generatedSlug;
    }

    try {
        const bodyUrl = new URL(url); // 获取链接中的域名

        let customOrigin = env.SHORT_DOMAINS ? `https://${env.SHORT_DOMAINS}` : origin;

        // 检查环境变量是否存在
        if (!env.ALLOW_DOMAINS) {
            // 检查是否指向相同当前域名
            if (bodyUrl.hostname === hostName) {
                return createResponse(403, '您不能缩短指向本域的链接', 403);
            }
        } else {
            const allowDomains = env.ALLOW_DOMAINS.split(',');
            // 检查是否指向相同域名(允许解析的域名)
            if (allowDomains.includes(bodyUrl.hostname)) {
                return createResponse(403, '您不能缩短指向本域的链接', 403);
            }
        }

        // 检查自定义 Slug 是否已存在
        let existingUrlQuery = null;
        if (slug) {
            existingUrlQuery = await env.DB.prepare(`SELECT url FROM links WHERE slug = ?`).bind(slug).first();
            if (existingUrlQuery) {
                if (existingUrlQuery.url === url) {
                    return createResponse(409, '该链接及 Slug 已存在', 409);
                }
                return createResponse(409, '自定义 Slug 已被使用，请换一个', 409);
            }
        }

        // 检查 URL 是否已存在
        const existingSlugQuery = await env.DB.prepare(`SELECT slug FROM links WHERE url = ?`).bind(url).first();
        if (existingSlugQuery && !slug && !email) {
            // 返回已生成的短链
            return createResponse(200, 'success', 200, {
                url: url,
                slug: existingSlugQuery.slug,
                link: `${customOrigin}/${existingSlugQuery.slug}`
            });
        }

        // 生成唯一的随机 Slug
        const generatedSlug = slug || await generateUniqueSlug(env);

        // 如果提供了密码，先进行哈希处理
        const hashedPassword = password ? await hashPassword(password) : null;

        // 插入新记录
        await env.DB.prepare(`
            INSERT INTO links (url, slug, password, email, ip, status, ua, hostname, create_time)
            VALUES (?, ?, ?, ?, ?, 'ok', ?, ?, ?)
        `)
        .bind(
            url || null,
            generatedSlug || null,
            hashedPassword || null,
            email || null,
            clientIP || null,
            userAgent || null,
            hostName || null,
            formattedDate || null
        ).run();

        // 返回短链信息
        return createResponse(200, 'success', 200, {
            url: url,
            slug: generatedSlug,
            link: `${customOrigin}/${generatedSlug}`
        });
    } catch (e) {
        // 错误处理
        return createResponse(500, e.message, 500);
    }
}
