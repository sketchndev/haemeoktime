import axios from 'axios'

const apiBase = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, '/')
const client = axios.create({ baseURL: apiBase })

const AI_ERROR_MSG = 'AI 시스템 에러가 발생했습니다.'

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const detail = err.response?.data?.detail || err.message || '오류가 발생했습니다'
    if (err.response?.status === 503) {
      console.error('[Gemini Error]', detail)
      return Promise.reject(new Error(AI_ERROR_MSG))
    }
    return Promise.reject(new Error(detail))
  }
)

export default client

/**
 * SSE 스트리밍 POST 요청. 서버에서 보내는 progress/stage/result 이벤트를 실시간 수신.
 * @param {string} url - /api 이하 경로
 * @param {object} body - POST body
 * @param {(data: {progress?:number, stage?:string, result?:any, error?:string}) => void} onEvent
 * @returns {Promise<any>} 최종 result
 */
export async function fetchSSE(url, body, onEvent) {
  const res = await fetch(`${apiBase}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    let msg = '오류가 발생했습니다'
    try { msg = JSON.parse(text).detail || msg } catch {}
    if (res.status === 503) {
      console.error('[Gemini Error]', msg)
      throw new Error(AI_ERROR_MSG)
    }
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.error) {
          console.error('[Gemini Error]', data.error)
          throw new Error(AI_ERROR_MSG)
        }
        if (data.result) finalResult = data.result
        onEvent(data)
      } catch (e) {
        if (e.message && !e.message.startsWith('Unexpected')) throw e
      }
    }
  }

  if (!finalResult) throw new Error('서버 응답이 비정상적입니다')
  return finalResult
}
