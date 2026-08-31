import { memo, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Furniture, Part, Placement } from '@neftya/engine';

/**
 * La 3D.
 *
 * **Une pièce 3D = un composant du modèle.** Chaque instance porte l'identifiant que le
 * menuisier lira sur son plan, et cliquer dessus sélectionne cette pièce-là.
 *
 * Le budget d'images par seconde est la contrainte, pas la beauté. Un meuble courant tient
 * en quelques dizaines de panneaux ; les géométries et matériaux sont donc mémoïsés et
 * partagés, l'éclairage est fixe, et rien n'anime en continu. Si la fluidité ne passe pas
 * sur un mobile d'entrée de gamme, la réponse est de réduire le nombre d'objets rendus,
 * pas de renoncer à l'interaction.
 *
 * @see docs/IMPLEMENTATION.md — phase 3
 */

/** Le monde est en mètres ; le modèle en millimètres. */
const MM = 0.001;

/** Ce qu'on distingue à l'œil. Les couleurs ne portent aucune information de cote. */
const COLOURS: Record<string, string> = {
  top: '#c8a97e',
  bottom: '#c8a97e',
  side: '#b7955f',
  divider: '#b7955f',
  shelf: '#d7bd94',
  back: '#8d7350',
  drawer_face: '#a67c48',
  drawer_side: '#c0a273',
  drawer_front_panel: '#c0a273',
  drawer_back_panel: '#c0a273',
  drawer_bottom: '#c0a273',
};

export interface SceneProps {
  furniture: Furniture;
  selectedPartId: string | null;
  onSelect: (partId: string | null) => void;
  /** Écarte les pièces depuis le centre, de 0 (assemblé) à 1 (éclaté). */
  explode: number;
}

export function Scene({ furniture, selectedPartId, onSelect, explode }: SceneProps) {
  const centre = useMemo(() => boundingCentre(furniture), [furniture]);

  return (
    <Canvas
      // `dpr` plafonné : sur un mobile à 3× le nombre de pixels à remplir triple, pour un
      // gain visuel nul sur des panneaux plats.
      dpr={[1, 2]}
      camera={{ position: [2.2, 1.8, 2.6], fov: 45 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#f5f2ec']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />

      <group position={[-centre.x, -centre.y, -centre.z]}>
        {furniture.parts.flatMap((part) =>
          part.instances.map((placement, index) => (
            <PartMesh
              key={`${part.id}-${index}`}
              part={part}
              placement={placement}
              centre={centre}
              explode={explode}
              selected={part.id === selectedPartId}
              onSelect={onSelect}
            />
          )),
        )}
      </group>

      <OrbitControls makeDefault enablePan={false} minDistance={0.8} maxDistance={12} />
    </Canvas>
  );
}

interface PartMeshProps {
  part: Part;
  placement: Placement;
  centre: { x: number; y: number; z: number };
  explode: number;
  selected: boolean;
  onSelect: (partId: string) => void;
}

/**
 * Mémoïsé : faire glisser un curseur ne redessine que les pièces dont les cotes changent.
 * C'est ce qui tient le budget d'images par seconde quand la largeur bouge en continu.
 */
const PartMesh = memo(function PartMesh({
  part,
  placement,
  centre,
  explode,
  selected,
  onSelect,
}: PartMeshProps) {
  const position: [number, number, number] = [
    (placement.xMm + placement.sizeXMm / 2) * MM,
    (placement.yMm + placement.sizeYMm / 2) * MM,
    (placement.zMm + placement.sizeZMm / 2) * MM,
  ];

  // L'éclatement écarte chaque pièce du centre, proportionnellement à sa distance : les
  // pièces intérieures s'écartent peu, l'enveloppe beaucoup, et l'assemblage reste lisible.
  const exploded: [number, number, number] = [
    position[0] + (position[0] - centre.x) * explode,
    position[1] + (position[1] - centre.y) * explode,
    position[2] + (position[2] - centre.z) * explode,
  ];

  return (
    <mesh
      position={exploded}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.id);
      }}
    >
      <boxGeometry
        args={[placement.sizeXMm * MM, placement.sizeYMm * MM, placement.sizeZMm * MM]}
      />
      <meshStandardMaterial
        color={selected ? '#2f6f4f' : (COLOURS[part.role] ?? '#c8a97e')}
        roughness={0.75}
        metalness={0}
      />
    </mesh>
  );
});

function boundingCentre(furniture: Furniture): { x: number; y: number; z: number } {
  return {
    x: (furniture.input.dimensions.widthMm * MM) / 2,
    y: (furniture.input.dimensions.heightMm * MM) / 2,
    z: (furniture.input.dimensions.depthMm * MM) / 2,
  };
}
