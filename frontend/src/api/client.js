import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.detail || err.message || '오류가 발생했습니다'
    return Promise.reject(new Error(message))
  }
)

export default client
