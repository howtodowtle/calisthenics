import { render } from 'preact'
import '@fontsource-variable/geist/index.css'
import 'basecoat-standalone.css'
import './index.css'
import { App } from './ui/App'

// Ask the browser not to evict our storage (iOS may still do so if the app is
// unused for weeks — that's what Settings → Export backup is for).
navigator.storage?.persist?.().catch(() => {})

render(<App />, document.getElementById('app')!)
