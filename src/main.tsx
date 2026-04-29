import { diagnosis, log, showDiagnosis } from './boot-diag'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

log('react', '开始加载 React 应用...')

try {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    throw new Error('找不到 #root DOM 元素')
  }

  const App = (await import('./App.tsx')).default
  const { ErrorBoundary } = await import('./components/ErrorBoundary.tsx')

  log('react', 'React 组件加载成功，开始挂载...')

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )

  log('react', 'React 挂载完成')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  diagnosis.errors.push(`[react-boot] ${msg}`)
  if (err instanceof Error && err.stack) {
    diagnosis.errors.push(`[stack] ${err.stack.slice(0, 800)}`)
  }
  showDiagnosis()
}
