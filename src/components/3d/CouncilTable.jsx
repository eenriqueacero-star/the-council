// Future: Hexagonal council table with agent seats
export default function CouncilTable() {
  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[3, 3, 0.2, 6]} />
      <meshStandardMaterial color="#18181B" metalness={0.8} roughness={0.2} />
    </mesh>
  );
}
