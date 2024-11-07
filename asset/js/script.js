/*
 * Copyright (c) molikai-work (2024)
 * molikai-work 的特定修改和新增部分
 * 根据 MIT 许可证发布
 */

$(document).ready(function() {
    $('.cf-turnstile').show();

    function checkCaptchaLoaded() {
        if ($('.cf-turnstile').height() > 0) {
            $('#captcha-tip').hide()
        } else {
            $('#captcha-tip').show();
            setTimeout(checkCaptchaLoaded, 400)
        }
    }
    checkCaptchaLoaded();
    let loading = false;

    function showAlert(type, message) {
        $('#alert').removeClass().addClass(type).text(message)
    }
    $('#submit').on('click', function() {
        const url = $('#url').val();
        const slug = $('#slug').val();
        const password = $('#password').val();
        const email = $('#email').val();
        const turnstileResponse = $('[name="cf-turnstile-response"]').val();
        if (!url) {
            showAlert('error', '请填写你要缩短的 URL');
            return
        }
        if (!/^(https?):\/\/.{3,}/.test(url)) {
            showAlert('error', 'URL 格式不合规范');
            return
        }
        showAlert(null, '');
        loading = true;
        $('#submit').prop('disabled', true).addClass('loading');
        const body = {
            url: url,
            "turnstileToken": turnstileResponse
        };
        if (slug) {
            body.slug = slug
        }
        if (password) {
            body.password = password
        }
        if (email) {
            body.email = email
        }
        $.ajax({
            url: '/create',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(body)
        }).done(function(res) {
            loading = false;
            $('#submit').prop('disabled', false).removeClass('loading');
            if (res.message && res.code !== 200) {
                showAlert('error', res.message);
                return
            }
            $('#url').val(res.link);
            $('#url')[0].select();
            showAlert('success', '完成，请复制下方的链接！')
        }).fail(function(xhr) {
            let errorMsg = '抱歉，短链创建失败，请重试';
            if (xhr.status === 429) {
                errorMsg = '操作速度过快，请稍后再试'
            } else if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message
            }
            console.error('Error details:', {
                status: xhr.status,
                statusText: xhr.statusText,
                responseText: xhr.responseText
            });
            showAlert('error', errorMsg);
            loading = false;
            $('#submit').prop('disabled', false).removeClass('loading')
        })
    })
});
