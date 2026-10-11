import { useApp } from './app/state'
import { Setup } from './screens/Setup'
import { Login } from './screens/Login'
import { Shell } from './screens/Shell'
import { SyncPill } from './screens/Shell'

export function App() {
  const { device, session } = useApp()
  if (!device) return <div className="shell"><div className="bar-top"><SyncPill /></div><Setup /></div>
  if (!session) return <div className="shell"><Login /></div>
  return <Shell />
}
