// Placeholder for future 3D agent characters
// Each agent will have a unique 3D model with:
// - Idle animation
// - Speaking animation (when presenting their verdict)
// - Reaction animations (agree/disagree with other agents)
// - Glow effect in their agent color

export default function AgentModel({ agent, isSpeaking, position }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial
        color={agent.color}
        emissive={agent.color}
        emissiveIntensity={isSpeaking ? 0.5 : 0.1}
      />
    </mesh>
  );
}
