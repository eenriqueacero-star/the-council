import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import CouncilChamber from './CouncilChamber.jsx'

// Canvas wrapper — lazy-import this whole file from CouncilTab for code splitting.
// Three.js + fiber only land in the bundle when Council tab first mounts.
export default function CouncilScene({ agentState, synthesis, speaking, tickerStances, agentStats, height = '44vh' }) {
  const [interactive, setInteractive] = useState(false)

  return (
    <div style={{ position: 'relative', height, borderRadius: 16, overflow: 'hidden', background: '#020408', flexShrink: 0 }}>
      <Canvas
        camera={{ position: [0, 4.5, 13], fov: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <CouncilChamber
            agentState={agentState}
            synthesis={synthesis}
            speaking={speaking}
            tickerStances={tickerStances}
            agentStats={agentStats}
            onInteraction={() => setInteractive(true)}
          />
        </Suspense>
      </Canvas>
      {interactive && (
        <div style={{
          position: 'absolute', bottom: 8, right: 10,
          fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)',
          background: 'rgba(0,0,0,0.5)', padding: '2px 7px', borderRadius: 4,
          pointerEvents: 'none',
        }}>
          interactive · auto-resets 10s
        </div>
      )}
    </div>
  )
}
