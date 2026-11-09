import { describe, expect, it } from 'vitest'
import {
  buildNetdiskShareUrl,
  getNetdiskQuotaPercent,
  resolveFallbackNetdiskAccountId,
  resolveInitialNetdiskAccountId,
  type NetdiskSelectableAccount,
} from '@/utils/netdisk'

function account(id: number, platform = 'quark', is_primary = false): NetdiskSelectableAccount {
  return { id, platform, is_primary }
}

describe('netdisk account selection', () => {
  describe('resolveInitialNetdiskAccountId', () => {
    const accounts = [account(1), account(2, 'quark', true), account(3, 'baidu')]

    it('returns null for an empty list', () => {
      expect(resolveInitialNetdiskAccountId([], '1')).toBeNull()
    })

    it('prefers the query account id when it matches', () => {
      expect(resolveInitialNetdiskAccountId(accounts, '3')).toBe(3)
    })

    it('falls back to the primary account when query misses', () => {
      expect(resolveInitialNetdiskAccountId(accounts, '999')).toBe(2)
      expect(resolveInitialNetdiskAccountId(accounts, undefined)).toBe(2)
    })

    it('falls back to the first account when nothing matches and no primary exists', () => {
      const noPrimary = [account(5), account(6)]
      expect(resolveInitialNetdiskAccountId(noPrimary, 'abc')).toBe(5)
      expect(resolveInitialNetdiskAccountId(noPrimary)).toBe(5)
    })
  })

  describe('resolveFallbackNetdiskAccountId', () => {
    it('returns null when the removed account is the only one', () => {
      expect(resolveFallbackNetdiskAccountId([account(1)], 1)).toBeNull()
    })

    it('prefers the next account on the same platform', () => {
      const accounts = [account(1), account(2), account(3, 'baidu')]
      expect(resolveFallbackNetdiskAccountId(accounts, 1)).toBe(2)
    })

    it('uses the last same-platform account when the removed one was last in its group', () => {
      const accounts = [account(1), account(2), account(3, 'baidu')]
      expect(resolveFallbackNetdiskAccountId(accounts, 2)).toBe(1)
    })

    it('falls back across platforms by original order (next first)', () => {
      const accounts = [account(1, 'baidu'), account(2, 'quark'), account(3, 'quark')]
      expect(resolveFallbackNetdiskAccountId(accounts, 1)).toBe(2)
    })

    it('falls back across platforms to the previous account when removing the last', () => {
      const accounts = [account(1, 'quark'), account(2, 'baidu')]
      expect(resolveFallbackNetdiskAccountId(accounts, 2)).toBe(1)
    })

    it('returns the first account when the removed id is unknown', () => {
      expect(resolveFallbackNetdiskAccountId([account(1), account(2)], 999)).toBe(1)
    })
  })

  describe('getNetdiskQuotaPercent', () => {
    it('returns 0 when total is missing or non-positive', () => {
      expect(getNetdiskQuotaPercent(10, 0)).toBe(0)
      expect(getNetdiskQuotaPercent(10, undefined)).toBe(0)
    })

    it('rounds and clamps to 100', () => {
      expect(getNetdiskQuotaPercent(1, 3)).toBe(33)
      expect(getNetdiskQuotaPercent(200, 100)).toBe(100)
    })
  })
})

describe('buildNetdiskShareUrl', () => {
  it.each([
    ['xunlei', 'https://pan.xunlei.com/s/'],
    ['uc', 'https://drive.uc.cn/s/'],
    ['quark', 'https://pan.quark.cn/s/'],
    ['pan115', 'https://115cdn.com/s/'],
    ['baidu', 'https://pan.baidu.com/s/'],
    ['guangya', 'https://www.guangyapan.com/s/'],
  ])('builds the %s share url from the platform prefix', (platform, prefix) => {
    expect(buildNetdiskShareUrl(platform, 'abc123')).toBe(`${prefix}abc123`)
  })

  it('returns an empty string for platforms without a share url prefix', () => {
    expect(buildNetdiskShareUrl('tianyi', 'abc123')).toBe('')
    expect(buildNetdiskShareUrl('unknown', 'abc123')).toBe('')
    expect(buildNetdiskShareUrl('', 'abc123')).toBe('')
  })

  it('returns an empty string for a missing or blank share code', () => {
    expect(buildNetdiskShareUrl('quark', '')).toBe('')
    expect(buildNetdiskShareUrl('quark', '   ')).toBe('')
  })

  it('trims and url-encodes the share code', () => {
    expect(buildNetdiskShareUrl('quark', ' a b/1 ')).toBe('https://pan.quark.cn/s/a%20b%2F1')
  })
})
