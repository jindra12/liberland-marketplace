export const withTimeout = async <T>({
  promise,
  timeoutMs,
  timeoutMessage,
}: {
  promise: Promise<T>
  timeoutMs: number
  timeoutMessage: string
}): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

