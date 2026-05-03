import { useEffect } from 'react'
import ChartContainer from './components/Plot/ChartContainer'
import { Sidebar } from './components/Layout/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import { useGraphStore } from './store/useGraphStore'
import './index.css'

export default function App() {
  const { loadPersistedState } = useGraphStore();

  useEffect(() => {
    loadPersistedState();
  }, [loadPersistedState]);

  return (
    <ErrorBoundary level="top">
      <div className="app-container">
        <ChartContainer />
        <Sidebar />
      </div>
    </ErrorBoundary>
  )
}
