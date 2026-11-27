/** Runs a data loader and returns null instead of throwing, so one missing table never blanks the whole page. */
export async function safe<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader()
  } catch (error) {
    // notFound()/redirect() signal through thrown errors; let those through.
    const digest = (error as { digest?: string })?.digest
    if (typeof digest === 'string' && /NEXT_(HTTP_ERROR_FALLBACK|NOT_FOUND|REDIRECT)/.test(digest)) throw error
    console.error('[admin] data load failed', error instanceof Error ? error.message : error)
    return null
  }
}
