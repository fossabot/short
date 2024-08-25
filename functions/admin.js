/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/ip.js

import { createResponse, hashPassword } from './utils';

import html403 from '../403.html';

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

    // 处理操作请求的函数
    async function handleOperationRequest(context) {
        try {
            const { request, env } = context;
            const clientIP = request.headers.get("CF-Connecting-IP");
            const hostName = request.headers.get("Host");

            // 如果请求的主机名不是原 API 的主机名
            if (!context.env.SHORT_DOMAINS) {
                // 环境变量不存时跳过代码执行
            } else if (hostName !== `${context.env.SHORT_DOMAINS}`) {
                // 返回 403 响应
                return new Response(html403, {
                    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
                    status: 403
                });
            }

            //  如果是 GET 请求
            if (context.request.method === 'GET') {
                return createResponse(405, '请使用 POST 方法管理短链。', 405);
            }

            let requestBody;
            try {
                // 解析请求体
                requestBody = await context.request.json();
            } catch (jsonError) {
                // JSON 解析失败
                return createResponse(400, `JsonError: ${jsonError.message}`, 400);
            }

            // 从 JSON 数据中解构出进入参数
            const { operation, slug, password, newUrl, newSlug, newPassword, turnstileToken } = requestBody;

            if (newUrl && !/^(https?):\/\/.{3,}/.test(newUrl)) {
                return createResponse(422, 'URL 格式不合规范', 422);
            }

            if (newSlug && (newSlug.length < 4 || newSlug.length > 9 || !/^(?!\.)[a-zA-Z0-9\u4e00-\u9fa5\u3400-\u4DBf]+(\.(?![a-zA-Z])[a-zA-Z0-9\u4e00-\u9fa5\u3400-\u4DBf]+)*$/.test(newSlug))) {
                return createResponse(422, 'Slug 4-9位且不能以点开头或结束、含有部分特殊字符和扩展名', 422);
            }

            if (newPassword &&!/^(?=.*[a-zA-Z])(?=.*[0-9@#$%&])[a-zA-Z0-9@#$%&]{6,12}$/.test(newPassword)) {
                return createResponse(422, '密码 6-12位且大小写字母和数字或部分特殊符号必须包含其中两项', 422);
            }

            if (!turnstileToken && context.env.TURNSTILE_SECRET_KEY) {
                return createResponse(403, '需要完成验证码才能管理短链', 403);
            }

            if (!turnstileToken || !context.env.TURNSTILE_SECRET_KEY) {
                // 环境变量不存时跳过代码执行
            } else {
                // 验证 Turnstile 令牌
                const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        secret: context.env.TURNSTILE_SECRET_KEY,
                        response: turnstileToken,
                        remoteip: clientIP
                    })
                });
                const turnstileResult = await turnstileResponse.json();

                if (!turnstileResult.success) {
                    return createResponse(403, '验证码验证失败，请刷新重试', 403);
                }
            }

            async function verifyPassword(slug, password) {
                try {
                    // 验证密码
                    const result = await context.env.DB.prepare(`
                        SELECT password FROM links WHERE slug = ?
                    `).bind(slug).first();

                    if (!result || result === "undefined") {
                        return false;
                    }

                    const hashedPassword = await hashPassword(password);

                    return result.password === hashedPassword;
                } catch (error) {
                    // 错误处理
                    throw new Error(`VerifyPassword: ${error.message}`);
                }
            }

            // 验证密码
            const isPasswordValid = await verifyPassword(slug, password);
            if (!isPasswordValid) {
                return createResponse(401, '密码验证失败', 401);
            }

            // 根据操作类型执行相应逻辑
            switch (operation) {
                case 'verify': // 验证
                    return createResponse(200, '密码验证成功', 200);

                case 'update-url': // 更新 URL
                    return await handleUpdateUrlRequest(slug, newUrl, hostName);

                case 'update-slug': // 更新 Slug
                    return await handleUpdateSlugRequest(slug, newSlug);

                case 'update-password': // 更新 Password
                    const hashedNewPassword = await hashPassword(newPassword);
                    return await handleUpdatePasswordRequest(slug, hashedNewPassword);

                case 'delete': // 删除
                    return await handleDeleteRequest(slug);

                default:
                    return createResponse(400, '无效的操作', 400);
            }
        } catch (error) {
            // 错误处理
            return createResponse(500, `Main: ${error.message}`, 500);
        }
    }

    async function handleUpdateUrlRequest(slug, newUrl) {
        try {
            if (!newUrl) {
                return createResponse(422, '请填写你要更新的目标 URL', 422);
            }

            const levelDomain = new URL(newUrl).hostname.split('.').pop();
            if (levelDomain === 'gov' || levelDomain === 'edu') {
                return createResponse(403, '包含禁止更新的顶级域名', 403);
            }

            const specialDomains = ["eu.org", "us.kg", "pp.ua"];
            const urlHostnameParts = new URL(newUrl).hostname.split('.');
            let urlHostname;
            for (const specialDomain of specialDomains) {
                if (urlHostnameParts.slice(-specialDomain.split('.').length).join('.') === specialDomain) {
                    urlHostname = urlHostnameParts.join('.');
                    break;
                }
            }
            if (!urlHostname) {
                urlHostname = urlHostnameParts.slice(-2).join('.');
            }
            const banUrlQueryResult = await context.env.DB.prepare(`
                SELECT id AS id
                FROM banUrl 
                WHERE url = ?
            `).bind(urlHostname).first();
            if (banUrlQueryResult) {
                return createResponse(403, '此链接域名在禁止更新名单中', 403);
            }

            const bodyUrl = new URL(newUrl);
            if (!context.env.ALLOW_DOMAINS) {
                if (bodyUrl.hostname === hostName) {
                    return createResponse(403, '您不能更新为指向本域的链接', 403);
                }
            } else {
                const allowDomains = context.env.ALLOW_DOMAINS.split(',');
                if (allowDomains.includes(bodyUrl.hostname)) {
                    return createResponse(403, '您不能更新为指向本域的链接', 403);
                }
            }

            // 更新网址
            const result = await context.env.DB.prepare(`
                UPDATE links SET url = ? WHERE slug = ?
            `).bind(newUrl, slug).run();

            return createResponse(200, '网址已成功更新', 200);
        } catch (error) {
            // 处理更新网址错误
            return createResponse(500, `UpdateUrl: ${error.message}`, 500);
        }
    }

    async function handleUpdateSlugRequest(oldSlug, newSlug) {
        try {
            if (!newSlug) {
                return createResponse(422, '请填写你要更新的 Slug', 422);
            }

            // 检查 Slug 是否已存在
            const existingSlug = await context.env.DB.prepare(`
                SELECT id FROM links WHERE slug = ?
            `).bind(newSlug).first();

            if (existingSlug) {
                return createResponse(409, 'Slug 已经存在', 409);
            }

            // 更新 Slug
            const result = await context.env.DB.prepare(`
                UPDATE links SET slug = ? WHERE slug = ?
            `).bind(newSlug, oldSlug).run();

            return createResponse(200, 'Slug 已成功更新', 200);
        } catch (error) {
            // 错误处理
            return createResponse(500, `UpdateSlug: ${error.message}`, 500);
        }
    }

    async function handleUpdatePasswordRequest(slug, newPassword) {
        try {
            if (!newPassword) {
                return createResponse(422, '请勿设置空密码', 422);
            }

            // 更新密码
            const result = await context.env.DB.prepare(`
                UPDATE links SET password = ? WHERE slug = ?
            `).bind(newPassword, slug).run();

            return createResponse(200, '密码已成功更新', 200);
        } catch (error) {
            // 错误处理
            return createResponse(500, `UpdatePassword: ${error.message}`, 500);
        }
    }

    async function handleDeleteRequest(slug) {
        try {
            // 删除短链
            const result = await context.env.DB.prepare(`
                DELETE FROM links WHERE slug = ?
            `).bind(slug).run();

            return createResponse(200, '短链已成功删除', 200);
        } catch (error) {
            // 错误处理
            return createResponse(500, `DeleteSlug: ${error.message}`, 500);
        }
    }

    // 处理请求
    return await handleOperationRequest(context);
}
