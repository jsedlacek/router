import { ReadableStream } from 'node:stream/web'
import { text } from 'node:stream/consumers'
import { describe, expect, it } from 'vitest'
import { transformStreamWithRouter } from '../src/ssr/transformStreamWithRouter'

/**
 * Helper to create a ReadableStream from an array of string chunks.
 */
function createStream(chunks: Array<string>): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

/**
 * Creates a mock router with simplified SSR properties for testing.
 */
const createMockRouter = (injectedHtml: string) => {
  return {
    serverSsr: {
      injectedHtml: [Promise.resolve(injectedHtml)],
      setRenderFinished: () => {},
    },
    subscribe: () => () => {},
  } as any
}

describe('transformStreamWithRouter', () => {
  const injectedScript = '<script>console.log("router")</script>'

  it('should inject router stream after meta charset tag', async () => {
    const router = createMockRouter(injectedScript)
    const html =
      '<html><head><meta charset="UTF-8"><title>Test</title></head><body></body></html>'
    const appStream = createStream([html])

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><head><meta charset="UTF-8">${injectedScript}<title>Test</title></head><body></body></html>`,
    )
  })

  it('should inject router stream after meta charset tag with various formats', async () => {
    const router = createMockRouter(injectedScript)
    const html = `<html><head><meta charset='utf-8' /></head></html>`
    const appStream = createStream([html])

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><head><meta charset='utf-8' />${injectedScript}</head></html>`,
    )
  })

  it('should inject router stream before closing head tag if no meta charset', async () => {
    const router = createMockRouter(injectedScript)
    const html = '<html><head><title>Test</title></head><body></body></html>'
    const appStream = createStream([html])

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><head><title>Test</title>${injectedScript}</head><body></body></html>`,
    )
  })

  it('should handle chunked stream for meta charset injection', async () => {
    const router = createMockRouter(injectedScript)
    const chunks = [
      '<html><head>',
      '<meta charset="UTF-8">',
      '<title>Test</title></head>',
      '<body></body></html>',
    ]
    const appStream = createStream(chunks)

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><head><meta charset="UTF-8">${injectedScript}<title>Test</title></head><body></body></html>`,
    )
  })

  it('should handle meta charset tag being split across chunks', async () => {
    const router = createMockRouter(injectedScript)
    const chunks = [
      '<html><head><meta ',
      'charset="UTF-8">',
      '</head><body>',
      '</body></html>',
    ]
    const appStream = createStream(chunks)

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><head><meta charset="UTF-8">${injectedScript}</head><body></body></html>`,
    )
  })

  it('should handle chunked stream for closing head tag injection', async () => {
    const router = createMockRouter(injectedScript)
    const chunks = [
      '<html><head><title>Test</title>',
      '</head>',
      '<body></body></html>',
    ]
    const appStream = createStream(chunks)

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><head><title>Test</title>${injectedScript}</head><body></body></html>`,
    )
  })

  it('should inject before body closing tag if head is not present', async () => {
    const router = createMockRouter(injectedScript)
    const html = '<html><body><div>Hello</div></body></html>'
    const appStream = createStream([html])

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    expect(resultHtml).toBe(
      `<html><body><div>Hello</div>${injectedScript}</body></html>`,
    )
  })

  it('should append script at the end if stream ends before head or body is closed', async () => {
    const router = createMockRouter(injectedScript)
    const html = '<html><head><title>Test</title>'
    const appStream = createStream([html])

    const resultStream = transformStreamWithRouter(router, appStream)
    const resultHtml = await text(resultStream)

    // The stream flushes any buffered script at the end if no proper injection point was found
    expect(resultHtml).toBe(`<html><head><title>Test</title>${injectedScript}`)
  })
})
