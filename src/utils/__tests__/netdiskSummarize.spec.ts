import { describe, expect, it } from 'vitest'
import { formatNetdiskSpeed, summarizeNetdiskPlatforms } from '@/utils/netdisk'

const G = 1024 ** 3

function account(platform: string, status: string, quotaUsed = 0, quotaTotal = 0) {
  return { platform, status, quota_used: quotaUsed, quota_total: quotaTotal }
}

describe('summarizeNetdiskPlatforms', () => {
  it('marks a platform success when all accounts are active', () => {
    const result = summarizeNetdiskPlatforms([
      account('quark', 'active'),
      account('quark', 'active'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ platform: 'quark', total: 2, active: 2, statusColor: 'success' })
  })

  it('marks a platform warning when only some accounts are active', () => {
    const result = summarizeNetdiskPlatforms([
      account('baidu', 'active'),
      account('baidu', 'expired'),
    ])
    expect(result[0]).toMatchObject({ total: 2, active: 1, statusColor: 'warning' })
  })

  it('marks a platform error when no account is active', () => {
    const result = summarizeNetdiskPlatforms([
      account('uc', 'expired'),
      account('uc', 'failed'),
    ])
    expect(result[0]).toMatchObject({ total: 2, active: 0, statusColor: 'error' })
  })

  it('sums free space only over accounts with positive quota_total', () => {
    const result = summarizeNetdiskPlatforms([
      account('quark', 'active', 30 * G, 100 * G),
      account('quark', 'active', 0, 50 * G),
      account('quark', 'active', 10, 0), // no quota, excluded
    ])
    expect(result[0].freeBytes).toBe(70 * G + 50 * G)
  })

  it('clamps negative free space to zero', () => {
    const result = summarizeNetdiskPlatforms([
      account('quark', 'active', 200 * G, 100 * G),
    ])
    expect(result[0].freeBytes).toBe(0)
  })

  it('returns null freeBytes when no account has quota data', () => {
    const result = summarizeNetdiskPlatforms([
      account('quark', 'active', 0, 0),
    ])
    expect(result[0].freeBytes).toBeNull()
  })

  it('omits platforms without accounts and merges aliases', () => {
    const result = summarizeNetdiskPlatforms([
      account('c139', 'active'),
      account('pan139', 'active'),
      account('xunlei', 'active'),
    ])
    expect(result.map(item => item.platform)).toEqual(['pan139', 'xunlei'])
    expect(result[0].total).toBe(2)
  })

  it('sorts platforms by the canonical netdisk order', () => {
    const result = summarizeNetdiskPlatforms([
      account('xunlei', 'active'),
      account('quark', 'active'),
      account('baidu', 'active'),
    ])
    expect(result.map(item => item.platform)).toEqual(['quark', 'baidu', 'xunlei'])
  })

  it('averages only accounts with speed samples', () => {
    const result = summarizeNetdiskPlatforms([
      { platform: 'quark', status: 'active', quota_used: 0, quota_total: 0, speed: 10 },
      { platform: 'quark', status: 'active', quota_used: 0, quota_total: 0, speed: 20 },
      { platform: 'quark', status: 'active', quota_used: 0, quota_total: 0, speed: 0 },
    ])
    expect(result[0].avgSpeed).toBe(15)
  })

  it('returns null avgSpeed when no account has a sample', () => {
    const result = summarizeNetdiskPlatforms([
      { platform: 'quark', status: 'active', quota_used: 0, quota_total: 0, speed: 0 },
    ])
    expect(result[0].avgSpeed).toBeNull()
  })
})

describe('formatNetdiskSpeed', () => {
  it('formats speed with binary units', () => {
    expect(formatNetdiskSpeed(0)).toBe('--')
    expect(formatNetdiskSpeed(1024)).toBe('1.0 KB/s')
    expect(formatNetdiskSpeed(12.3 * 1024 ** 2)).toBe('12.3 MB/s')
  })
})
