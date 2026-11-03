import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { configuredAdminAccount, credentialsMatch } from './admin-credentials';

describe('admin credentials', () => {
  test('缺用户名或口令都算未配置', () => {
    assert.equal(configuredAdminAccount('', 'secret'), null);
    assert.equal(configuredAdminAccount('   ', 'secret'), null);
    assert.equal(configuredAdminAccount('admin', ''), null);
    assert.deepEqual(configuredAdminAccount(' admin ', 'secret'), {
      username: 'admin',
      password: 'secret',
    });
  });

  test('用户名和口令都要相同，长度不同也不会抛错', () => {
    const account = { username: '管理员', password: 'correct-horse' };
    assert.equal(
      credentialsMatch({ username: '管理员', password: 'correct-horse' }, account),
      true,
    );
    assert.equal(credentialsMatch({ username: '管理员', password: 'wrong' }, account), false);
    assert.equal(
      credentialsMatch({ username: 'admin', password: 'correct-horse' }, account),
      false,
    );
    assert.equal(credentialsMatch({ username: '', password: '' }, account), false);
  });
});
