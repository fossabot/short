/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/manage.js

import { allowOrigin, createResponse, shortName, hashPassword, specialDomains } from './utils';

export async function onRequest(context) {
    const { request, env } = context;

    // 设置跨域请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': `${allowOrigin}`,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    const clientIP = request.headers.get("CF-Connecting-IP");
    const hostName = request.headers.get("Host");

    // 如果请求的主机名不是原 API 的主机名
    if (!env.SHORT_DOMAINS) {
        // 环境变量不存时跳过代码执行
    } else if (hostName !== `${env.SHORT_DOMAINS}`) {
        // 返回 403 响应
        return createResponse(403, `请求来源主机名不合法`);
    }

    // 如果没有数据库变量
    if (!env.DB) {
        return createResponse(500, `${shortName}管理工具 API 运行正常，但尚未配置数据库。`);
    }

    //  如果不是 POST 请求
    if (request.method !== 'POST' && request.method !== 'HEAD') {
        return createResponse(405, `${shortName}管理工具 API 运行正常，请使用 POST 方法管理短链。`);
    }

    let requestBody;
    try {
        // 解析请求体
        requestBody = await request.json();
    } catch (jsonError) {
        // JSON 解析失败
        return createResponse(400, `JsonError: ${jsonError.message}`);
    }

    // 从 JSON 数据中解构出进入参数
    const { operation, slug, password, newUrl, newSlug, newPassword, turnstileToken } = requestBody;

    if (!operation) {
        return createResponse(422, '请选择一个短链操作以继续');
    }

    if (!slug) {
        return createResponse(422, '请填写你要管理的短链的 Slug');
    }

    if (!password) {
        return createResponse(422, '请填写你要管理的短链的密码');
    }

    if ((operation === "update-url" || newUrl) && !/^(https?):\/\/.{3,}/.test(newUrl)) {
        return createResponse(422, '新 URL 格式不合规范');
    }

    if ((operation === "update-slug" || newSlug) && (newSlug.length < 4 || newSlug.length > 16 || !/^(?!\.)[a-zA-Z0-9\u4e00-\u9fa5\u3400-\u4DBf]+(\.(?![a-zA-Z])[a-zA-Z0-9\u4e00-\u9fa5\u3400-\u4DBf]+)*$/.test(newSlug))) {
        return createResponse(422, '新 Slug 4-16位且不能以点开头或结束、含有部分特殊字符和扩展名');
    }

    if ((operation === "update-password" || newPassword) && !/^[a-zA-Z0-9~!@#$%^&\*()\[\]{}\-+_=\."'?\/]{6,32}$/.test(newPassword)) {
        return createResponse(422, '新密码6-32位且不支持部分特殊字符');
    }

    if (!turnstileToken && env.TURNSTILE_SECRET_KEY) {
        return createResponse(403, '需要完成验证码才能管理短链');
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
            return createResponse(403, '验证码验证失败，请刷新重试');
        }
    }

    async function verifyPassword(slug, password) {
        try {
            // 验证密码
            const result = await env.DB.prepare(`
                SELECT password FROM links WHERE slug = ? LIMIT 1
            `).bind(slug).first();

            if (!result || result.password === null || result.password === "null") {
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
        return createResponse(401, '密码验证失败');
    }

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

    // 如果状态为 ban，则返回 403
    if (status === "ban") {
        return createResponse(403, '此短链已被封禁并禁止更新');
    }

    // 根据操作类型执行相应逻辑
    switch (operation) {
        case 'verify': // 验证
            return createResponse(200, '密码验证成功');

        case 'update-url': // 更新 URL
            return await handleUpdateUrlRequest(slug, newUrl);

        case 'update-slug': // 更新 Slug
            return await handleUpdateSlugRequest(slug, newSlug);

        case 'update-password': // 更新 Password
            const hashedNewPassword = await hashPassword(newPassword);
            return await handleUpdatePasswordRequest(slug, hashedNewPassword);

        case 'toggle-status': // 切换状态
            return await handleToggleStatusRequest(slug, status);

        case 'delete': // 删除
            return await handleDeleteRequest(slug);

        default:
            return createResponse(400, '无效的操作');
    }

    // 更新短链的目标网址
    async function handleUpdateUrlRequest(slug, newUrl) {
        try {
            if (!newUrl) {
                return createResponse(422, '请填写你要更新的目标 URL');
            }

            const levelDomain = new URL(newUrl).hostname.split('.').pop();
            if (levelDomain === 'gov' || levelDomain === 'edu') {
                return createResponse(403, '包含禁止更新的顶级域名');
            }

            const urlHostnameParts = new URL(newUrl).hostname.split('.');
            let urlHostname = null;
            if (/^(\d{1,3}\.){3}\d{1,3}$/.test(new URL(newUrl).hostname)) {
                urlHostname = new URL(newUrl).hostname;
            } else {
                for (const specialDomain of specialDomains) {
                    const specialDomainPartsCount = specialDomain.split('.').length;

                    if (urlHostnameParts.slice(-specialDomainPartsCount).join('.') === specialDomain) {
                        urlHostname = urlHostnameParts.slice(-specialDomainPartsCount - 1).join('.');
                        break;
                    }
                }

                if (!urlHostname) {
                    urlHostname = urlHostnameParts.slice(-2).join('.');
                }
            }
            const banUrlQueryResult = await env.DB.prepare(`
                SELECT id AS id
                FROM banDomain 
                WHERE domain = ?
            `).bind(urlHostname).first();
            if (banUrlQueryResult) {
                return createResponse(403, '此链接域名在禁止更新名单中');
            }

            const bodyUrl = new URL(newUrl);
            if (!env.ALLOW_DOMAINS) {
                if (bodyUrl.hostname === hostName) {
                    return createResponse(403, '您不能更新为指向本域的链接');
                }
            } else {
                const allowDomains = env.ALLOW_DOMAINS.split(',');
                if (allowDomains.includes(bodyUrl.hostname)) {
                    return createResponse(403, '您不能更新为指向本域的链接');
                }
            }

            // 更新网址
            const result = await env.DB.prepare(`
                UPDATE links SET url = ? WHERE slug = ?
            `).bind(newUrl, slug).run();

            return createResponse(200, '网址已成功更新');
        } catch (error) {
            // 处理更新网址错误
            return createResponse(500, `UpdateUrl: ${error.message}`);
        }
    }

    // 更新短链的 slug
    async function handleUpdateSlugRequest(oldSlug, newSlug) {
        try {
            if (!newSlug) {
                return createResponse(422, '请填写你要更新的 Slug');
            }

            // 检查 slug 是否已存在
            const existingSlug = await env.DB.prepare(`
                SELECT id FROM links WHERE slug = ?
            `).bind(newSlug).first();

            if (existingSlug) {
                return createResponse(409, 'Slug 已经存在');
            }

            // 更新 slug
            const result = await env.DB.prepare(`
                UPDATE links SET slug = ? WHERE slug = ?
            `).bind(newSlug, oldSlug).run();

            return createResponse(200, 'Slug 已成功更新');
        } catch (error) {
            // 错误处理
            return createResponse(500, `UpdateSlug: ${error.message}`);
        }
    }

    // 更新短链的管理密码
    async function handleUpdatePasswordRequest(slug, hashNewPassword) {
        try {
            if (!hashNewPassword) {
                return createResponse(422, '请勿设置空密码');
            }

            // 更新密码
            const result = await env.DB.prepare(`
                UPDATE links SET password = ? WHERE slug = ?
            `).bind(hashNewPassword, slug).run();

            return createResponse(200, '密码已成功更新');
        } catch (error) {
            // 错误处理
            return createResponse(500, `UpdatePassword: ${error.message}`);
        }
    }

    // 切换短链的状态
    async function handleToggleStatusRequest(slug, currentStatus) {
        try {
            // 切换状态
            const newStatus = currentStatus === 'ok' ? 'proxy' : 'ok';

            // 检查当前状态是否为 ok 或 proxy
            if (currentStatus !== 'ok' && currentStatus !== 'proxy') {
                return createResponse(500, '未知问题，无法切换状态');
            }

            const result = await env.DB.prepare(`
                UPDATE links SET status = ? WHERE slug = ?
            `).bind(newStatus, slug).run();

            return createResponse(200, `短链状态已成功切换`);
        } catch (error) {
            // 错误处理
            return createResponse(500, `ToggleStatus: ${error.message}`);
        }
    }

    // 删除目标短链
    async function handleDeleteRequest(slug) {
        try {
            // 删除短链
            const result = await env.DB.prepare(`
                DELETE FROM links WHERE slug = ?
            `).bind(slug).run();

            return createResponse(200, '短链已成功删除');
        } catch (error) {
            // 错误处理
            return createResponse(500, `DeleteSlug: ${error.message}`);
        }
    }
}
