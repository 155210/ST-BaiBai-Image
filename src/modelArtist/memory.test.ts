import { describe, expect, it } from 'vitest';
import { artistToRestore } from './memory';

const yes = () => true;

describe('artistToRestore', () => {
  it('切模型、画师串没动、新模型有记录 → 换成记录的', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'b', artistId: 'x' }, { b: 'y' }, yes)).toBe('y');
  });
  it('记录是「不使用」也照换', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'b', artistId: 'x' }, { b: '' }, yes)).toBe('');
  });
  it('新模型没记录 → 不换', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'b', artistId: 'x' }, {}, yes)).toBeNull();
  });
  it('只改画师串 → 不换', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'a', artistId: 'z' }, { a: 'y' }, yes)).toBeNull();
  });
  it('模型和画师串一起变(导入设置)→ 不换', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'b', artistId: 'z' }, { b: 'y' }, yes)).toBeNull();
  });
  it('记录的画师串被删了 → 不换', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'b', artistId: 'x' }, { b: 'y' }, () => false)).toBeNull();
  });
  it('记录和当前一样 → 不换', () => {
    expect(artistToRestore({ model: 'a', artistId: 'x' }, { model: 'b', artistId: 'x' }, { b: 'x' }, yes)).toBeNull();
  });
});
