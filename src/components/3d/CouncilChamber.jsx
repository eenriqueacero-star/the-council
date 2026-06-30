import { useRef, useMemo, useState, useEffect, useCallback } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, AdaptiveDpr, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { AGENTS } from '../../constants/agents.js'

// ── Layout ──────────────────────────────────────────────────────────────────
const TABLE_R = 4        // hex table radius
const SEAT_R  = 3.6      // agent seat radius
const SEAT_Y  = 0.65     // agent float height
const AXIOM_POS = [0, 2.4, 0]  // center, elevated above table

// 6 agents at 60° intervals, offset 30° so none blocks the front-center view
const AGENT_ANGLES = AGENTS.map((_, i) => (i / 6) * Math.PI * 2 + Math.PI / 6)
const AGENT_POSITIONS = AGENT_ANGLES.map(a => [
  SEAT_R * Math.sin(a), SEAT_Y, SEAT_R * Math.cos(a),
])

// Verdict color palette (weekly + manual councils)
const VERDICT_COLORS = {
  HOLD: '#22C55E', ADD: '#3B82F6', TRIM: '#F59E0B', EXIT: '#EF4444',
  BUY:  '#22C55E', WATCH: '#F59E0B', SKIP: '#EF4444',
}

// ── Agent geometry — one shape per specialist ────────────────────────────────
function AgentGeometry({ index }) {
  switch (index) {
    case 0: return <icosahedronGeometry args={[0.55, 1]} />         // REX – technical
    case 1: return <octahedronGeometry  args={[0.62, 0]} />         // NOVA – catalyst
    case 2: return <torusGeometry       args={[0.38, 0.16, 8, 14]} />  // SAGE – risk
    case 3: return <dodecahedronGeometry args={[0.52, 0]} />        // ATLAS – macro
    case 4: return <tetrahedronGeometry  args={[0.64, 0]} />        // VEGA – bear
    default: return <torusKnotGeometry   args={[0.30, 0.11, 48, 6, 2, 3]} /> // ZEN – sizer
  }
}

// ── Agent seat — floating holographic shape + label ──────────────────────────
function AgentSeat({ agent, index, isSpeaking, winRate }) {
  const shapeRef = useRef()
  const wireRef  = useRef()
  const lightRef = useRef()
  const baseY = AGENT_POSITIONS[index][1]
  const pos   = AGENT_POSITIONS[index]

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const speed = 0.12 + index * 0.015

    if (shapeRef.current) {
      shapeRef.current.rotation.y += speed * 0.008
      shapeRef.current.rotation.x = Math.sin(t * 0.55 + index) * 0.11
      // Float bob
      shapeRef.current.position.y = baseY + Math.sin(t * 0.85 + index * 1.1) * 0.13
      // Aura — scales with win rate
      const base = winRate > 0.7 ? 1.8 : winRate < 0.5 ? 0.45 : 1.0
      const pulse = (isSpeaking ? 3.8 : base) * (0.82 + Math.sin(t * 2.1 + index) * 0.18)
      shapeRef.current.material.emissiveIntensity = pulse
    }
    if (wireRef.current) {
      wireRef.current.rotation.y -= speed * 0.006
      wireRef.current.rotation.x = Math.sin(t * 0.4 + index + 1) * 0.09
    }
    if (lightRef.current) {
      lightRef.current.intensity = isSpeaking ? 5
        : (winRate > 0.7 ? 2.2 : winRate < 0.5 ? 0.6 : 1.3)
    }
  })

  const s = isSpeaking ? 1.28 : 1.0

  return (
    <group position={pos}>
      {/* Solid holographic shape */}
      <mesh ref={shapeRef} scale={[s, s, s]}>
        <AgentGeometry index={index} />
        <meshStandardMaterial
          color={agent.color} emissive={agent.color} emissiveIntensity={1.0}
          metalness={0.2} roughness={0.5}
        />
      </mesh>
      {/* Wireframe overlay (slightly larger) */}
      <mesh ref={wireRef} scale={[s * 1.18, s * 1.18, s * 1.18]}>
        <AgentGeometry index={index} />
        <meshStandardMaterial wireframe color={agent.color} transparent opacity={0.22} />
      </mesh>
      {/* Agent color point light */}
      <pointLight ref={lightRef} color={agent.color} intensity={1.3} distance={3.5} />
      {/* Name label */}
      <Html position={[0, -1.35, 0]} center distanceFactor={8}>
        <div style={{ textAlign: 'center', pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: agent.color,
            textShadow: `0 0 8px ${agent.color}80`, whiteSpace: 'nowrap' }}>
            {agent.name}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>
            {agent.role.split(' ')[0].toUpperCase()}
          </div>
          {winRate != null && (
            <div style={{ fontFamily: 'monospace', fontSize: 7, whiteSpace: 'nowrap',
              color: winRate > 0.7 ? '#22C55E' : winRate < 0.5 ? '#EF4444' : '#71717A' }}>
              {(winRate * 100).toFixed(0)}% acc
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

// ── AXIOM — elevated center, double counter-rotating hex rings ────────────────
function AxiomCore({ slamPhase }) {
  const coreRef  = useRef()
  const ring1Ref = useRef()
  const ring2Ref = useRef()
  const ring3Ref = useRef()
  const lightRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const speed = (slamPhase === 'charge' || slamPhase === 'slam') ? 3.2 : 1

    if (ring1Ref.current) ring1Ref.current.rotation.z += 0.011 * speed
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z -= 0.008 * speed
      ring2Ref.current.rotation.x += 0.004 * speed
    }
    if (ring3Ref.current) ring3Ref.current.rotation.y += 0.006 * speed

    if (coreRef.current) {
      const base = slamPhase === 'dim' ? 0.25
        : slamPhase === 'charge' ? 4.5
        : slamPhase === 'slam'   ? 6.0
        : slamPhase === 'settle' ? 2.0
        : 1.2 + Math.sin(t * 1.8) * 0.3
      coreRef.current.material.emissiveIntensity = base
    }
    if (lightRef.current) {
      lightRef.current.intensity = slamPhase === 'charge' ? 10
        : slamPhase === 'slam'   ? 14
        : 2.5 + Math.sin(t * 1.5) * 0.5
    }
  })

  return (
    <group position={AXIOM_POS}>
      {/* Core sphere */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.88, 32, 32]} />
        <meshStandardMaterial
          color="#F5F0E8" emissive="#F59E0B" emissiveIntensity={1.2}
          metalness={0.55} roughness={0.2}
        />
      </mesh>
      {/* Hex ring 1 */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.55, 0.045, 6, 6]} />
        <meshStandardMaterial color="#F59E0B" emissive="#F59E0B" emissiveIntensity={2.8} />
      </mesh>
      {/* Hex ring 2 — counter-rotating, tilted */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3.5, 0, 0]}>
        <torusGeometry args={[1.85, 0.032, 6, 6]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={2} transparent opacity={0.6} />
      </mesh>
      {/* Thin accent ring */}
      <mesh ref={ring3Ref} rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[2.15, 0.022, 3, 6]} />
        <meshStandardMaterial color="#6366F1" emissive="#6366F1" emissiveIntensity={1.8} transparent opacity={0.5} />
      </mesh>
      <pointLight ref={lightRef} color="#F59E0B" intensity={2.5} distance={9} />
      <pointLight color="#FFFFFF" intensity={0.6} distance={4} position={[0, 1.2, 0]} />
      {/* AXIOM label */}
      <Html position={[0, -1.9, 0]} center distanceFactor={8}>
        <div style={{ textAlign: 'center', pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#F59E0B',
            textShadow: '0 0 16px #F59E0B80', whiteSpace: 'nowrap', letterSpacing: '0.14em' }}>
            AXIOM
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap' }}>
            CHAIR · THE COUNCIL
          </div>
        </div>
      </Html>
    </group>
  )
}

// ── Hex table — glass surface with edge glow ─────────────────────────────────
function HexTable() {
  const edgeRef = useRef()

  useFrame(({ clock }) => {
    if (edgeRef.current)
      edgeRef.current.material.emissiveIntensity = 1.3 + Math.sin(clock.elapsedTime * 0.7) * 0.45
  })

  return (
    <group>
      {/* Table surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[TABLE_R, TABLE_R, 0.12, 6]} />
        <meshStandardMaterial
          color="#060e1c" metalness={0.92} roughness={0.12}
          transparent opacity={0.9} emissive="#0a1830" emissiveIntensity={0.4}
        />
      </mesh>
      {/* Glowing edge band */}
      <mesh ref={edgeRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}>
        <cylinderGeometry args={[TABLE_R + 0.06, TABLE_R + 0.06, 0.018, 6]} />
        <meshStandardMaterial color="#3B82F6" emissive="#3B82F6" emissiveIntensity={1.5} transparent opacity={0.65} />
      </mesh>
      {/* Grid lines etched across table (3 pairs = hex cross) */}
      {[0, Math.PI / 3, 2 * Math.PI / 3].map((angle, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, angle, 0]} position={[0, 0.065, 0]}>
          <planeGeometry args={[TABLE_R * 2, 0.012]} />
          <meshStandardMaterial color="#3B82F6" emissive="#3B82F6" emissiveIntensity={0.9} transparent opacity={0.25} />
        </mesh>
      ))}
      {/* Dark reflective floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#030508" metalness={0.97} roughness={0.03} />
      </mesh>
    </group>
  )
}

// ── Energy channels — curved bezier lines agent→AXIOM + cross-links ──────────
function EnergyChannels({ speaking }) {
  const lines = useMemo(() => {
    const result = []
    AGENTS.forEach((agent, i) => {
      const s = new THREE.Vector3(...AGENT_POSITIONS[i])
      const e = new THREE.Vector3(...AXIOM_POS)
      const mid = new THREE.Vector3(
        (s.x + e.x) / 2,
        Math.max(s.y, e.y) + 1.6,
        (s.z + e.z) / 2,
      )
      const pts = new THREE.QuadraticBezierCurve3(s, mid, e)
        .getPoints(24).map(p => [p.x, p.y, p.z])
      result.push({ pts, color: agent.color, id: agent.id })
    })
    // Cross-channels: opposing pairs (0↔3, 1↔4, 2↔5)
    ;[[0, 3], [1, 4], [2, 5]].forEach(([a, b]) => {
      const s = new THREE.Vector3(...AGENT_POSITIONS[a])
      const e = new THREE.Vector3(...AGENT_POSITIONS[b])
      const pts = new THREE.QuadraticBezierCurve3(s, new THREE.Vector3(0, 1.3, 0), e)
        .getPoints(24).map(p => [p.x, p.y, p.z])
      result.push({ pts, color: '#1e3a5f', id: null })
    })
    return result
  }, [])

  return (
    <group>
      {lines.map((l, i) => {
        const active = speaking && (l.id === speaking || speaking === 'synthesis')
        return (
          <Line
            key={i} points={l.pts} color={l.color}
            lineWidth={active ? 2.0 : 0.45}
            transparent opacity={active ? 0.9 : 0.14}
          />
        )
      })}
    </group>
  )
}

// ── Consensus ring — 6 arc segments around table edge ────────────────────────
function ConsensusRing({ agentState }) {
  const segsRef = useRef([])

  const verdicts = useMemo(() =>
    AGENTS.map(ag => {
      const st = agentState?.[ag.id] || {}
      return st.r3?.result?.stance || st.r2?.result?.stance || st.r1?.result?.stance || null
    })
  , [agentState])

  const filled = verdicts.filter(Boolean)
  const allSame = filled.length >= 2 && new Set(filled).size === 1

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    segsRef.current.forEach((mesh, i) => {
      if (!mesh) return
      const hasV = verdicts[i] != null
      const pulse = allSame
        ? 3.2 + Math.sin(t * 2.2) * 0.6
        : hasV ? 1.6 + Math.sin(t * 1.4 + i) * 0.35 : 0.18
      mesh.material.emissiveIntensity = pulse
    })
  })

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {AGENTS.map((agent, i) => {
        const segAngle = (i / 6) * Math.PI * 2
        const hasV = verdicts[i] != null
        return (
          <mesh key={i} ref={el => segsRef.current[i] = el} rotation={[0, 0, segAngle]}>
            <torusGeometry args={[TABLE_R + 0.55, hasV ? 0.055 : 0.022, 3, 8, (Math.PI * 2 / 6) - 0.08]} />
            <meshStandardMaterial
              color={agent.color} emissive={agent.color} emissiveIntensity={0.18}
              transparent opacity={hasV ? 0.88 : 0.22}
            />
          </mesh>
        )
      })}
    </group>
  )
}

// ── Data rain — instanced falling pixel-rods in background ───────────────────
const COUNT = 110

function DataRain({ speaking }) {
  const meshRef = useRef()
  const posRef  = useRef(null)
  const velRef  = useRef(null)
  const dummy   = useMemo(() => new THREE.Object3D(), [])

  useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const vel = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 32
      pos[i * 3 + 1] = Math.random() * 24 - 4
      pos[i * 3 + 2] = (Math.random() - 0.5) * 32
      vel[i] = 0.04 + Math.random() * 0.06
    }
    posRef.current = pos
    velRef.current = vel
  }, [])

  useFrame(() => {
    if (!meshRef.current || !posRef.current) return
    const pos = posRef.current
    const vel = velRef.current
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 1] -= vel[i]
      if (pos[i * 3 + 1] < -6) pos[i * 3 + 1] = 22
      dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  const color = speaking
    ? (AGENTS.find(a => a.id === speaking)?.color || '#1e3a5f')
    : '#0d1f3c'

  return (
    <instancedMesh ref={meshRef} args={[null, null, COUNT]}>
      <boxGeometry args={[0.04, 0.28, 0.04]} />
      <meshBasicMaterial color={color} transparent opacity={0.18} />
    </instancedMesh>
  )
}

// ── Conflict lightning — jagged arcs between disagreeing agents ───────────────
function ConflictLightning({ tickerStances }) {
  const [bolts, setBolts] = useState([])

  const conflicts = useMemo(() => {
    if (!tickerStances) return []
    const bull = [], bear = []
    AGENTS.forEach((ag, i) => {
      const s = tickerStances[ag.id]?.stance
      if (s === 'bullish') bull.push(i)
      else if (s === 'bearish') bear.push(i)
    })
    return bull.flatMap(bi => bear.map(bei => {
      const ca = new THREE.Color(AGENTS[bi].color)
      const cb = new THREE.Color(AGENTS[bei].color)
      return { a: bi, b: bei, color: '#' + ca.clone().lerp(cb, 0.5).getHexString() }
    }))
  }, [tickerStances])

  useEffect(() => {
    if (!conflicts.length) { setBolts([]); return }
    const id = setInterval(() => {
      setBolts(conflicts.map(({ a, b, color }) => {
        const pA = AGENT_POSITIONS[a]
        const pB = AGENT_POSITIONS[b]
        const pts = [[pA[0], pA[1], pA[2]]]
        for (let s = 1; s <= 5; s++) {
          const t = s / 6
          pts.push([
            pA[0] + (pB[0] - pA[0]) * t + (Math.random() - 0.5) * 0.9,
            pA[1] + (pB[1] - pA[1]) * t + (Math.random() - 0.5) * 0.75,
            pA[2] + (pB[2] - pA[2]) * t + (Math.random() - 0.5) * 0.9,
          ])
        }
        pts.push([pB[0], pB[1], pB[2]])
        return { pts, color }
      }))
    }, 80)
    return () => clearInterval(id)
  }, [conflicts])

  return (
    <group>
      {bolts.map((b, i) => (
        <Line key={i} points={b.pts} color={b.color} lineWidth={1.4} transparent opacity={0.8} />
      ))}
    </group>
  )
}

// ── Verdict shockwave ring — expands outward on slam ─────────────────────────
function ShockwaveRing({ verdict }) {
  const meshRef = useRef()
  const progRef = useRef(0)

  useEffect(() => { progRef.current = 0 }, [verdict])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    progRef.current = Math.min(progRef.current + delta * 3.2, 1)
    const s = progRef.current * 8
    meshRef.current.scale.set(s, s, s)
    meshRef.current.material.opacity = Math.max(0, 0.9 - progRef.current)
  })

  const color = VERDICT_COLORS[verdict] || '#F59E0B'
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
      <torusGeometry args={[1, 0.04, 4, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} transparent opacity={0.9} />
    </mesh>
  )
}

// ── Verdict text overlay (Html in 3D space) ───────────────────────────────────
function VerdictSlamText({ verdict, phase }) {
  if (!verdict || !phase || phase === 'dim' || phase === 'charge') return null
  const color = VERDICT_COLORS[verdict] || '#F59E0B'
  return (
    <Html position={[0, 4.2, 0]} center>
      <div style={{
        pointerEvents: 'none', userSelect: 'none',
        fontFamily: 'var(--font-display, monospace)',
        fontSize: 68, fontWeight: 900, letterSpacing: '0.1em',
        color, textShadow: `0 0 28px ${color}, 0 0 56px ${color}80`,
        opacity: phase === 'settle' ? 0 : 1,
        transform: phase === 'slam' ? 'scale(1.15)' : 'scale(1)',
        transition: 'opacity 1.2s ease, transform 0.3s ease',
      }}>
        {verdict}
      </div>
    </Html>
  )
}

// ── Camera — cinematic auto-orbit, manual takeover, 10s reset ────────────────
function SceneCamera({ onInteraction, autoRotate }) {
  return (
    <OrbitControls
      autoRotate={autoRotate}
      autoRotateSpeed={1.0}
      enablePan={false}
      minDistance={5}
      maxDistance={22}
      maxPolarAngle={Math.PI / 2.12}
      target={[0, 0.8, 0]}
      onChange={onInteraction}
      enableDamping
      dampingFactor={0.08}
    />
  )
}

// ── Main export — full scene inside R3F Canvas ────────────────────────────────
export default function CouncilChamber({ agentState = {}, synthesis = {}, speaking, tickerStances, agentStats = {} }) {
  const [autoRotate, setAutoRotate] = useState(true)
  const [slamPhase,  setSlamPhase]  = useState(null)
  const timerRef = useRef(null)

  const handleInteraction = useCallback(() => {
    setAutoRotate(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setAutoRotate(true), 10000)
  }, [])

  // AXIOM verdict slam animation
  useEffect(() => {
    if (synthesis?.status !== 'done' || !synthesis?.result?.verdict) return
    setSlamPhase('dim')
    const t1 = setTimeout(() => setSlamPhase('charge'), 500)
    const t2 = setTimeout(() => setSlamPhase('slam'),   1500)
    const t3 = setTimeout(() => setSlamPhase('settle'), 3200)
    const t4 = setTimeout(() => setSlamPhase(null),     4800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [synthesis?.status, synthesis?.result?.verdict])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const verdict = synthesis?.result?.verdict

  return (
    <>
      <AdaptiveDpr pixelSizes={[0.75, 1.5, 2]} />
      <fog attach="fog" args={['#020408', 22, 65]} />

      {/* Global scene lighting */}
      <ambientLight intensity={0.12} />
      <pointLight position={[0, 14, 0]} intensity={0.7} color="#ffffff" />

      {/* Scene objects */}
      <HexTable />
      <ConsensusRing agentState={agentState} />
      <EnergyChannels speaking={speaking} />
      <ConflictLightning tickerStances={tickerStances} />
      <DataRain speaking={speaking} />

      {/* Agent seats */}
      {AGENTS.map((agent, i) => (
        <AgentSeat
          key={agent.id}
          agent={agent}
          index={i}
          isSpeaking={speaking === agent.id}
          winRate={agentStats?.[agent.id]?.win_rate ?? null}
        />
      ))}

      {/* AXIOM */}
      <AxiomCore slamPhase={slamPhase} />

      {/* Verdict slam effects */}
      {slamPhase === 'slam' && <ShockwaveRing verdict={verdict} />}
      <VerdictSlamText verdict={verdict} phase={slamPhase} />

      {/* Camera */}
      <SceneCamera autoRotate={autoRotate} onInteraction={handleInteraction} />
    </>
  )
}
