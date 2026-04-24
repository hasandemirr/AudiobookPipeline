import { Routes, Route, NavLink } from 'react-router-dom'
import { BookOpen, Settings, Mic } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import ReviewPage from './pages/ReviewPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      
      {/* Sol sidebar */}
      <nav className="w-16 border-r flex flex-col items-center 
                      py-4 gap-4 bg-muted/40">
        <NavLink to="/" 
          className={({isActive}) => 
            `p-3 rounded-lg transition-colors ${
              isActive 
                ? 'bg-primary text-primary-foreground' 
                : 'hover:bg-muted'
            }`}>
          <BookOpen size={20} />
        </NavLink>
        <NavLink to="/settings"
          className={({isActive}) => 
            `p-3 rounded-lg transition-colors ${
              isActive 
                ? 'bg-primary text-primary-foreground' 
                : 'hover:bg-muted'
            }`}>
          <Settings size={20} />
        </NavLink>
        <NavLink to="/tts"
          className={({isActive}) => 
            `p-3 rounded-lg transition-colors mt-auto ${
              isActive 
                ? 'bg-primary text-primary-foreground' 
                : 'hover:bg-muted'
            }`}>
          <Mic size={20} />
        </NavLink>
      </nav>

      {/* Ana içerik */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/review/:slug" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/tts" element={
            <div className="p-8 text-muted-foreground">
              TTS ekranı yakında...
            </div>
          } />
        </Routes>
      </main>
    </div>
  )
}
