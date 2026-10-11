import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const source = readFileSync(new URL('./luci/htdocs/luci-static/resources/view/deepseek-harness/config.js', import.meta.url), 'utf8');
async function test(reply, popup = true) {
  const option = () => ({ value() {}, formvalue() { return '1'; } });
  const form = { Map: class {
    section() { return { option, tab() {}, taboption(_tab, ...args) { return option(...args); } }; }
    render() { return Promise.resolve({ tag: 'form' }); }
  }, NamedSection: 0, Flag: 0, Value: 0, ListValue: 0, DynamicList: 0 };
  const notices = [];
  let replaced, closed = false, calls = 0;
  const opened = { opener: {}, location: { replace(url) { replaced = url; } }, close() { closed = true; } };
  const E = (tag, attrs = {}, children = []) => ({ tag, attrs, children });
  const instance = new Script('(function(){' + source + '\n})()').runInNewContext({
    E, URL, Promise, L: { resource: path => '/luci-static/resources/' + path },
    view: { extend: value => value }, form,
    rpc: { declare: spec => spec.object === 'deepseek-harness' ?
      () => { calls++; return Promise.resolve(reply); } : () => Promise.resolve({}) },
    poll: { add() {} },
    uci: { load() {}, get(_config, _section, field) { return field === 'listen' ? '0.0.0.0' : undefined; } },
    ui: { addNotification(_title, content) { notices.push(content.children); } },
    window: { location: { hostname: '192.168.1.1' }, open() { return popup ? opened : null; } },
  });
  const node = await instance.render([{}, { 'deepseek-harness': { instances: { main: { running: true } } } }]);
  const button = node.children[1].children[1].children[0];
  assert.equal(button.tag, 'button', 'Bare unauthenticated anchor must not be rendered');
  await button.attrs.click();
  return { replaced, closed, calls, notices, opened, button };
}
const success = await test({ token: 'fixture_token-123', port: 28000 });
assert.equal(success.replaced, 'http://192.168.1.1:28000/?token=fixture_token-123');
assert.equal(success.opened.opener, null);
assert.equal(success.button.disabled, false);
assert.equal(success.notices.length, 0);
const failed = await test({ error: '服务未运行，请先启用服务并保存。' });
assert.equal(failed.closed, true);
assert.equal(failed.replaced, undefined);
assert.equal(failed.notices.length, 1);
const blocked = await test({}, false);
assert.equal(blocked.calls, 0);
assert.equal(blocked.notices.length, 1);
console.log('PASS LuCI button opens authenticated URL, isolates opener and handles stopped service / blocked popup');
