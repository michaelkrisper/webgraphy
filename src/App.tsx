import { useEffect } from 'react'
import { PlotArea } from './components/Plot/PlotArea'
import { Sidebar } from './components/Layout/Sidebar'
import { useGraphStore } from './store/useGraphStore'
import './index.css'

function App() {
  const { loadPersistedState } = useGraphStore();

  useEffect(() => {
    loadPersistedState();
  }, [loadPersistedState]);

  return (
    <div className="app-container">
      <PlotArea />
      <Sidebar />
    </div>
  )
}

export default App
