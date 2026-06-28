import { Suspense, lazy } from 'react';

const Canvas = lazy(() => import('@react-three/fiber').then(m => ({ default: m.Canvas })));

export default function CouncilScene({ agents, speaking, verdict }) {
  return (
    <Suspense fallback={<div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading 3D scene...</div>}>
      <Canvas
        camera={{ position: [0, 5, 12], fov: 50 }}
        style={{ height: 400, borderRadius: 12, background: '#09090B' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[0, 10, 0]} intensity={1} />
        {/* Future: Agent 3D models will go here */}
        {/* Future: Council table geometry */}
        {/* Future: Speaking animation system */}
      </Canvas>
    </Suspense>
  );
}
