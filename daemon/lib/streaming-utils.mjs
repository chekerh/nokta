export function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function sendSSEDone(res, meta = {}) {
  sendSSE(res, { done: true, ...meta });
  res.end();
}

export function sendSSEError(res, message, status = 500) {
  sendSSE(res, { error: message, status });
  res.end();
}

export function streamOllama(response, res, onToken, meta = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function read() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              const token = data.message.content;
              sendSSE(res, { content: token });
              onToken?.(token);
            }
          } catch {}
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.message?.content) {
            sendSSE(res, { content: data.message.content });
          }
        } catch {}
      }

      sendSSEDone(res, meta);
    } catch (err) {
      sendSSEError(res, err.message);
    }
  }

  read();
}

export function streamOpenAI(response, res, onToken, meta = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function read() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            const token = data.choices?.[0]?.delta?.content || '';
            if (token) {
              sendSSE(res, { content: token });
              onToken?.(token);
            }
          } catch {}
        }
      }
      sendSSEDone(res, meta);
    } catch (err) {
      sendSSEError(res, err.message);
    }
  }

  read();
}

export function streamClaude(response, res, onToken, meta = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function read() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              sendSSE(res, { content: data.delta.text });
              onToken?.(data.delta.text);
            }
          } catch {}
        }
      }
      sendSSEDone(res, meta);
    } catch (err) {
      sendSSEError(res, err.message);
    }
  }

  read();
}
