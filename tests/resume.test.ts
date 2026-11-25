import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanText, readResumeFile } from '../src/main/resume'

describe('readResumeFile', () => {
  it('extracts text from every page of a PDF', async () => {
    const { name, text } = await readResumeFile(join(__dirname, 'fixtures', 'cv.pdf'))
    expect(name).toBe('cv.pdf')
    expect(text).toContain('Juana Perez - Data Analyst')
    expect(text).toContain('Rappi 2021-2024')
  })

  it('reads plain text files as UTF-8', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chuletai-'))
    const file = join(dir, 'cv.txt')
    writeFileSync(file, 'Ingeniera   de datos\r\n\r\n\r\n\r\nMedellín', 'utf8')
    const { text } = await readResumeFile(file)
    expect(text).toBe('Ingeniera de datos\n\nMedellín')
  })
})

describe('cleanText', () => {
  it('normalizes line endings, spaces and blank lines', () => {
    expect(cleanText('  a\t\tb \r\nc\n\n\n\nd  ')).toBe('a b \nc\n\nd')
  })
})
