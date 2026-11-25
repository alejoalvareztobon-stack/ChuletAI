// Lectura de la hoja de vida: PDF (texto extraído con unpdf) o texto plano.

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

export async function readResumeFile(path: string): Promise<{ name: string; text: string }> {
  const buffer = await readFile(path)
  const name = basename(path)
  if (extname(path).toLowerCase() === '.pdf') {
    // unpdf es solo ESM: se importa dinámicamente desde el bundle CJS del main.
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return { name, text: cleanText(Array.isArray(text) ? text.join('\n') : text) }
  }
  return { name, text: cleanText(buffer.toString('utf8')) }
}

export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
