const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.8
const MAX_FILE_SIZE = 1024 * 1024 // 1MB

export default function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      if (file.size <= MAX_FILE_SIZE && img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
        resolve(file)
        return
      }

      let { width, height } = img
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('이미지 압축에 실패했습니다'))
            return
          }
          const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
            type: 'image/jpeg',
          })
          resolve(compressed)
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없습니다'))
    }

    img.src = url
  })
}
