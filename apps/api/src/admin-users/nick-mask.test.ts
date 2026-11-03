import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { maskAdminNick } from './nick-mask';

describe('admin nick mask', () => {
  test('空昵称是 null，单字和双字都不保留全文', () => {
    assert.equal(maskAdminNick(null), null);
    assert.equal(maskAdminNick(undefined), null);
    assert.equal(maskAdminNick('   '), null);
    assert.equal(maskAdminNick('张'), '*');
    assert.equal(maskAdminNick('张三'), '张*');
    assert.notEqual(maskAdminNick('张三'), '张三');
  });

  test('更长的昵称留头尾，中间星号不超过三个', () => {
    assert.equal(maskAdminNick('张三丰'), '张*丰');
    assert.equal(maskAdminNick(' 备考同学 '), '备**学');
    assert.equal(maskAdminNick('备考同学甲乙'), '备***乙');
  });

  test('表情按一个字计，不拆成半个字符', () => {
    assert.equal(maskAdminNick('🙂a'), '🙂*');
    assert.equal(maskAdminNick('🙂ab'), '🙂*b');
  });
});
