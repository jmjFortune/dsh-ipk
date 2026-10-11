'use strict';
'require view';
'require form';
'require rpc';
'require poll';
'require uci';
'require ui';

var callService = rpc.declare({
	object: 'service', method: 'list', params: ['name'], expect: { '': {} }
});
var callLogin = rpc.declare({
	object: 'deepseek-harness', method: 'login', expect: { '': {} }
});

function isRunning(reply) {
	var instances = (reply['deepseek-harness'] || {}).instances || {};
	return Object.keys(instances).some(function(name) { return instances[name].running; });
}

return view.extend({
	load: function() {
		return Promise.all([uci.load('deepseek-harness'), callService('deepseek-harness')]);
	},
	render: function(data) {
		var running = isRunning(data[1]);
		var statusDot = E('span', { 'class': 'dsh-status-dot' });
		var statusText = E('span', { 'class': 'dsh-status-text' }, running ? '服务运行中' : '服务未运行');
		var statusBadge = E('span', {
			'class': 'dsh-status-badge',
			'role': 'status',
			'aria-live': 'polite',
			'data-running': running ? 'true' : 'false'
		}, [statusDot, statusText]);

		poll.add(function() {
			return callService('deepseek-harness').then(function(reply) {
				var curRunning = isRunning(reply);
				statusText.textContent = curRunning ? '服务运行中' : '服务未运行';
				statusBadge.setAttribute('data-running', curRunning ? 'true' : 'false');
			});
		}, 5);

		var m = new form.Map('deepseek-harness');

		// Section 1: 服务与存储
		var s1 = m.section(form.NamedSection, 'main', 'harness', '服务与存储');
		s1.anonymous = true;

		var oEnabled = s1.option(form.Flag, 'enabled', '开机自启守护');
		oEnabled.rmempty = false;

		var oDataDir = s1.option(form.Value, 'data_dir', '数据存储目录');
		oDataDir.placeholder = '/srv/deepseek-harness';
		oDataDir.validate = function(section, value) {
			if (!value && oEnabled.formvalue(section) !== '1') return true;
			return value && value.charAt(0) === '/' && value !== '/' &&
				!/(^|\/)\.\.?($|\/)/.test(value) ? true : '请输入独立目录的绝对路径';
		};

		// Section 2: 网络与访问控制
		var s2 = m.section(form.NamedSection, 'main', 'harness', '网络与访问控制');
		s2.anonymous = true;

		var oListen = s2.option(form.ListValue, 'listen', '监听接口');
		oListen.value('127.0.0.1', '仅本机（127.0.0.1）');
		oListen.value('0.0.0.0', '所有 IPv4 接口（0.0.0.0）');
		oListen.rmempty = false;

		var oPort = s2.option(form.Value, 'port', 'Web 端口');
		oPort.datatype = 'range(1024,65535)';
		oPort.rmempty = false;

		var oHost = s2.option(form.DynamicList, 'trusted_host', '受信任的主机 Host');
		oHost.placeholder = '例如: 192.168.1.1 或 router.lan';

		// Section 3: 运行参数与代理
		var s3 = m.section(form.NamedSection, 'main', 'harness', '运行参数与代理');
		s3.anonymous = true;

		var oHeap = s3.option(form.Value, 'heap_mb', 'V8 内存上限 (MB)');
		oHeap.datatype = 'range(128,32768)';
		oHeap.rmempty = false;

		var oProxy = s3.option(form.Value, 'proxy', '出站 HTTP 代理');
		oProxy.placeholder = 'http://127.0.0.1:7890 (可选)';
		oProxy.validate = function(section, value) {
			if (!value) return true;
			try { return /^https?:$/.test(new URL(value).protocol) ? true : '请使用 http:// 或 https://'; }
			catch (error) { return '请输入有效的代理 URL'; }
		};

		return m.render().then(function(formNode) {
			var host = uci.get('deepseek-harness', 'main', 'listen');
			var target = host === '0.0.0.0' || host === '::' ? window.location.hostname : host;
			if (target && target.indexOf(':') >= 0 && target.charAt(0) !== '[') target = '[' + target + ']';

			var link = host === '127.0.0.1' || host === '::1' ?
				E('p', { 'class': 'dsh-listen-hint' }, '当前仅监听本机，请设置为 0.0.0.0 并保存应用后再从局域网访问。') :
				E('button', {
					'class': 'cbi-button cbi-button-action dsh-open-btn',
					'type': 'button',
					'click': function() {
						var opened = window.open('about:blank', '_blank');
						if (!opened) {
							ui.addNotification(null, E('p', {}, '请允许此页面打开新标签页后重试。'), 'warning');
							return;
						}
						opened.opener = null;
						link.disabled = true;
						link.textContent = '正在连接…';
						return callLogin().then(function(reply) {
							if (reply.error || !reply.token || !reply.port)
								throw new Error(reply.error || '未取得登录链接，请稍后重试。');
							opened.location.replace('http://' + target + ':' + reply.port +
								'/?token=' + encodeURIComponent(reply.token));
						}).catch(function(error) {
							opened.close();
							ui.addNotification(null, E('p', {}, error.message), 'error');
						}).finally(function() {
							link.disabled = false;
							link.innerHTML = '<span>打开工作空间</span> <span class="dsh-arrow">→</span>';
						});
					}
				}, [E('span', {}, '打开工作空间'), E('span', { 'class': 'dsh-arrow' }, '→')]);

			return E('div', { 'class': 'dsh-settings' }, [
				E('link', { 'rel': 'stylesheet', 'href': L.resource('view/deepseek-harness/config.css') + '?v=20261011-align1' }),
				E('section', { 'class': 'dsh-hero-card', 'aria-label': 'Harness 服务看板' }, [
					E('div', { 'class': 'dsh-hero-left' }, [
						E('div', { 'class': 'dsh-hero-icon' }, [
							E('img', {
								'src': L.resource('view/deepseek-harness/whale.svg'),
								'alt': 'DeepSeek Whale Logo',
								'class': 'dsh-whale-img'
							})
						]),
						E('div', { 'class': 'dsh-hero-meta' }, [
							E('div', { 'class': 'dsh-hero-title-row' }, [
								E('h2', { 'class': 'dsh-title' }, 'DeepSeek Harness'),
								statusBadge
							]),
						])
					]),
					E('div', { 'class': 'dsh-hero-actions' }, [link])
				]),
				formNode
			]);
		});
	}
});
