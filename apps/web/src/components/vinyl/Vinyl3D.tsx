import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

function Disc({ spinning }: { spinning: boolean }) {
  const mesh = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (mesh.current && spinning) mesh.current.rotation.z += delta * 2.2;
  });

  return (
    <mesh ref={mesh} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[1.15, 1.15, 0.12, 96]} />
      <meshStandardMaterial color="#151515" metalness={0.35} roughness={0.65} />
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.02, 64]} />
        <meshStandardMaterial color="#d2b9c4" metalness={0.1} roughness={0.4} />
      </mesh>
    </mesh>
  );
}

export function Vinyl3D({ spinning = false, size = 320 }: { spinning?: boolean; size?: number }) {
  return (
    <div style={{ width: size, height: size }}>
      <Canvas camera={{ position: [0, 0, 3.2], fov: 42 }}>
        <ambientLight intensity={0.7} />
        <pointLight position={[2, 2, 3]} intensity={1.2} />
        <pointLight position={[-2, -1, 2]} intensity={0.5} color="#d2b9c4" />
        <Disc spinning={spinning} />
      </Canvas>
    </div>
  );
}
