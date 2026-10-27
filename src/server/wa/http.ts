export async function readBoundedBody(message: Pick<Response, 'body' | 'headers'>, limit: number, timeoutMs = 10000): Promise<Buffer> {
  const declared = message.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new Error('body_too_large');
  if (!message.body) return Buffer.alloc(0);
  const reader = message.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) return Buffer.concat(chunks, total);
      total += part.value.byteLength;
      if (total > limit) throw new Error('body_too_large');
      chunks.push(Buffer.from(part.value));
    }
  };
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('body_timeout')), timeoutMs);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

/** Bounds headers + streamed body together; redirects never carry credentials elsewhere. */
export async function requestBytes(http: typeof fetch, url: string, init: RequestInit, limit: number, timeoutMs = 10000): Promise<{ bytes: Buffer; contentType: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const response = await http(url, { ...init, redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('external_request_failed');
      const bytes = await readBoundedBody(response, limit, timeoutMs);
      return { bytes, contentType: response.headers.get('content-type') ?? '' };
    })(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('external_timeout')); }, timeoutMs);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
