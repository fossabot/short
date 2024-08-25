/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

// functions/utils.js

function createResponse(code, message, status, extraData = {}) {
    return Response.json({
        code: code,
        message: message,
        time: Date.now(),
        ...extraData
    }, {
        headers: corsHeaders,
        status: status
    });
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
};

const htmlCorsHeaders = {
    ...corsHeaders,
    "Content-Type": "text/html;charset=UTF-8"
};

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

const shortName =`Example 短网址`

const htmlHead =`<meta name="robots" content="noindex, follow" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" rel="preload" href="/css/jump-styles.min.css" as="style" />`

const adminEmail =`info@example.com`

const noscript =`<noscript>
    <p>注意：完整使用 ${shortName}需要浏览器支持（启用）JavaScript！</p>
    <p>此页面（短链跳转）也可以在不运行 JavaScript 的情况下使用，请手动操作页面。</p>
</noscript>`

const footer = `<p class="links">
    <hr />
    您还可以看看本站的友情链接：<br />
    <a href="https://gitcode.top/" title="友情链接：分享代码的博客" rel="noopener noreferrer" target="_blank">分享代码的博客</a> ｜
    <a href="https://furries.fun/" title="友情链接：小黄泊的小站" rel="noopener noreferrer" target="_blank">小黄泊的小站</a>
</p>
<script src="/js/web_console.min.js" async defer></script>`

export { createResponse, corsHeaders, htmlCorsHeaders, hashPassword, shortName, htmlHead, adminEmail, noscript, footer };
