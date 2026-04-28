import { describe, expect, it } from 'vitest';
import { createAkId, deriveAkSearchPrefix, encryptAkKey, decryptAkKey } from '../../src/ak/crypto.js';

/**
 * 分析 fix-3: deriveAkSearchPrefix HMAC 方案
 * 
 * 背景:
 * - deriveAkSearchPrefix 当前使用 key.slice(0, 12) 直接取前12字符作为搜索前缀
 * - 这个前缀存储在数据库的 key_search_prefix 字段中
 * - 用户可以通过提供 key 的前几个字符来搜索匹配记录
 * 
 * 分析:
 * 1. HMAC 方案: prefix = HMAC(masterKey, key).slice(0, 12)
 *    - 问题: HMAC 输出是确定性的伪随机值,与原始key内容无关
 *    - 用户无法通过知道 key 的前缀来计算 HMAC 前缀进行搜索
 *    - 破坏 prefix search 功能
 * 
 * 2. 当前方案 key.slice(0, 12) 的问题:
 *    - 前12字符明文暴露在数据库中
 *    - 对于格式为 env_prefix_secret 的 key,前12字符可能暴露较多信息
 * 
 * 3. 完整性保护替代方案:
 *    - id = sha1(key) 已经提供完整性校验(不同key产生不同id)
 *    - 可以在存储时同时保存 HMAC 校验值,但这会增加复杂度而不解决根本问题
 * 
 * 结论: 当前方案 key.slice(0, 12) 是合理的,因为:
 * - 保持 prefix search 功能正常
 * - HMAC 方案会破坏 prefix search
 * - sha1(key) 已经提供了关键完整性保护
 */

const masterKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

describe('deriveAkSearchPrefix integrity analysis', () => {
  // 当前实现: 直接取前12字符
  it('当前实现直接截取前12字符', () => {
    const key = 'op_sk_abcdef123456';
    const prefix = deriveAkSearchPrefix(key);
    expect(prefix).toBe('op_sk_abcdef');
    expect(prefix).toBe(key.slice(0, 12));
  });

  // 问题: 如果使用 HMAC,前缀搜索会失效
  it('HMAC方案会破坏prefix search - 演示', () => {
    const { createHmac } = require('node:crypto');
    const key = 'op_sk_abcdef123456';
    
    // HMAC 产生的是看起来随机的值,与原始key前缀无关
    const hmacPrefix = createHmac('sha256', masterKey).update(key).digest('hex').slice(0, 12);
    
    // 用户输入 "op_sk_ab" 想搜索,但无法通过计算 HMAC 来匹配
    const userSearchPrefix = 'op_sk_ab';
    
    // hmacPrefix 是 "7f3e2a1b4c5d" 这样的随机值,不等于 "op_sk_ab"
    // 因此 prefix search 无法工作
    expect(hmacPrefix).not.toBe(userSearchPrefix);
    expect(hmacPrefix).not.toMatch(/^op_sk_/);
  });

  // 当前方案允许前缀搜索正常工作
  it('当前方案支持前缀搜索', () => {
    const keys = [
      'op_sk_abcdef123456',
      'op_sk_abcdef789012', 
      'op_sk_zzzzzzz',
    ];
    
    const prefixes = keys.map(k => deriveAkSearchPrefix(k));
    
    // 用户输入 "op_sk_ab" 前缀
    const searchPrefix = 'op_sk_ab';
    
    // 可以找到前两个匹配的记录
    const matches = prefixes.filter(p => p.startsWith(searchPrefix));
    expect(matches.length).toBe(2);
    expect(matches).toContain('op_sk_abcdef');
  });

  // HMAC 方案无法进行前缀搜索
  it('HMAC方案无法进行前缀搜索 - 演示', () => {
    const { createHmac } = require('node:crypto');
    const keys = [
      'op_sk_abcdef123456',
      'op_sk_abcdef789012',
      'op_sk_zzzzzzz',
    ];
    
    const hmacPrefixes = keys.map(k => 
      createHmac('sha256', masterKey).update(k).digest('hex').slice(0, 12)
    );
    
    // 用户输入 "op_sk_ab" 前缀
    const searchPrefix = 'op_sk_ab';
    
    // 没有一个 HMAC 前缀匹配 "op_sk_ab"
    const matches = hmacPrefixes.filter(p => p.startsWith(searchPrefix));
    expect(matches.length).toBe(0);
  });

  // 完整性保护已通过 sha1(key) 实现
  it('id字段通过sha1提供完整性保护', () => {
    const key = 'op_sk_abcdef123456';
    const id = createAkId(key);
    
    // id 是 key 的 sha1 哈希,任何修改 key 的行为都会导致 id 不匹配
    expect(id).toBe('fdb441954fd4573a72fb5a52ce359e0d77c3fa0e');
    
    // 验证不同key产生不同id
    const differentKey = 'op_sk_abcdef123457';
    const differentId = createAkId(differentKey);
    expect(differentId).not.toBe(id);
  });

  // HMAC 无法恢复原始前缀,无法用于前缀搜索
  it('HMAC是单向的,无法从HMAC值恢复原始key前缀', () => {
    const { createHmac } = require('node:crypto');
    const key = 'op_sk_abcdef123456';
    const originalPrefix = key.slice(0, 12); // "op_sk_abcdef"
    
    const hmacOutput = createHmac('sha256', masterKey).update(key).digest('hex');
    
    // 给定 hmacOutput 和 masterKey,无法反向推出 "op_sk_abcdef"
    // 这正是 HMAC 的设计特性: 单向性
    // 这意味着即使攻击者获取了数据库中的 HMAC 前缀,也无法从中恢复原始 key 的前缀
    // 但同时也意味着合法用户也无法通过输入前缀来搜索
    expect(hmacOutput).not.toContain(originalPrefix);
  });
});
