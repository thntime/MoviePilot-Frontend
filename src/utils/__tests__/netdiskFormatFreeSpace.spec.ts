import { describe, expect, it } from 'vitest'
import { formatNetdiskFreeSpace } from '@/utils/netdisk'

describe('formatNetdiskFreeSpace', () => {
  it('formats bytes below 1 TiB as GiB with two decimals', () => {
    expect(formatNetdiskFreeSpace(1024 ** 3)).toBe('1.00G')
    expect(formatNetdiskFreeSpace(512 * 1024 ** 3)).toBe('512.00G')
    expect(formatNetdiskFreeSpace(1.5 * 1024 ** 3)).toBe('1.50G')
  })

  it('formats bytes at and above 1 TiB as TiB', () => {
    expect(formatNetdiskFreeSpace(1024 ** 4)).toBe('1.00T')
    expect(formatNetdiskFreeSpace(2.5 * 1024 ** 4)).toBe('2.50T')
    // 接近 1TiB 但不足时仍用 G
    expect(formatNetdiskFreeSpace(1024 ** 4 - 1)).toMatch(/G$/)
  })

  it('keeps two decimals without a space between number and unit', () => {
    expect(formatNetdiskFreeSpace(1234567890)).toBe('1.15G')
  })

  it('treats negative values as zero', () => {
    expect(formatNetdiskFreeSpace(-1)).toBe('0.00G')
    expect(formatNetdiskFreeSpace(-(1024 ** 4))).toBe('0.00G')
  })
})
