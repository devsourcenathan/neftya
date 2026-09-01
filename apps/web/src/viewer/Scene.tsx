import { memo, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, ContactShadows, OrbitControls } from '@react-three/drei';
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

/**
 * Des bois, pas des couleurs d'interface.
 *
 * L'enveloppe est plus sombre que ce qu'elle contient : c'est ce qui fait lire la structure
 * d'un coup d'œil, avant même de distinguer les pièces.
 */
const COLOURS: Record<string, string> = {
  top: '#c9a878',
  bottom: '#c9a878',
  side: '#b8945f',
  divider: '#bd9a66',
  shelf: '#d9c19a',
  back: '#8a7350',
  drawer_face: '#a87c4a',
  door: '#a87c4a',
  drawer_side: '#c4a578',
  drawer_front_panel: '#c4a578',
  drawer_back_panel: '#c4a578',
  drawer_bottom: '#c4a578',
};

const SELECTED = '#b45309';

export interface SceneProps {
  furniture: Furniture;
  selectedPartId: string | null;
  onSelect: (partId: string | null) => void;
  /** Écarte les pièces depuis le centre, de 0 (assemblé) à 1 (éclaté). */
  explode: number;
  /**
   * Identifiants des pièces masquées.
   *
   * **Masquer est une affaire de vue.** Une pièce invisible reste dans la liste de découpe,
   * dans la nomenclature et dans le devis : on la cache pour voir derrière, pas pour ne
   * plus la fabriquer.
   */
  hidden?: ReadonlySet<string>;
}

/**
 * Les pièces effectivement dessinées.
 *
 * Extraite de la scène pour être vérifiable : un canevas WebGL ne se lit pas dans un test,
 * et la règle qui décide ce qu'on voit mérite mieux qu'une inspection à l'œil.
 */
export function visibleParts(
  furniture: Furniture,
  hidden?: ReadonlySet<string>,
): Part[] {
  if (!hidden || hidden.size === 0) return furniture.parts;

  return furniture.parts.filter((part) => !hidden.has(part.id));
}

export function Scene({
  furniture,
  selectedPartId,
  onSelect,
  explode,
  hidden,
}: SceneProps) {
  const centre = useMemo(() => boundingCentre(furniture), [furniture]);

  // Le meuble change de taille ; la caméra doit suivre. Une position fixe cadrait un
  // caisson de 600 mm et perdait un dressing de 3 mètres hors de l'écran.
  const fitKey = `${furniture.input.dimensions.widthMm}x${furniture.input.dimensions.heightMm}x${furniture.input.dimensions.depthMm}`;

  return (
    <Canvas
      // `dpr` plafonné : sur un mobile à 3× le nombre de pixels à remplir triple, pour un
      // gain visuel nul sur des panneaux plats.
      dpr={[1, 2]}
      /**
       * Mesure immédiate, sans temporisation ni suivi du défilement.
       *
       * La scène est chargée à la demande : elle arrive après la mise en page, et une mesure
       * différée laisse le canevas à sa taille par défaut de 300 × 150 jusqu'au premier
       * redimensionnement.
       *
       * **Précaution non vérifiée.** Le navigateur d'essai ne compose pas d'images, donc
       * `ResizeObserver` n'y délivre rien et le canevas y reste à 300 × 150 quoi qu'on
       * fasse : impossible d'y distinguer le défaut de l'artefact. À confirmer dans un
       * vrai navigateur.
       */
      resize={{ debounce: 0, scroll: false }}
      shadows="soft"
      camera={{ fov: 40, position: [2.4, 1.9, 3] }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#f2ede6']} />

      {/* Trois sources : une principale qui porte l'ombre, une de remplissage pour que les
          faces sombres restent lisibles, une rasante qui détache les arêtes. */}
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[3.5, 5, 3]}
        intensity={1.5}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />
      <directionalLight position={[0, 1, -5]} intensity={0.25} />

      <Bounds key={fitKey} fit clip observe margin={1.25}>
        <group position={[-centre.x, -centre.y, -centre.z]}>
          {visibleParts(furniture, hidden).flatMap((part) =>
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
      </Bounds>

      {/* L'ombre de contact pose le meuble : sans elle il flotte, et l'œil ne sait plus
          où est le sol. */}
      <ContactShadows
        position={[0, -centre.y - 0.01, 0]}
        opacity={0.35}
        scale={Math.max(4, centre.x * 6)}
        blur={2.4}
        far={2}
      />

      <OrbitControls
        makeDefault
        enablePan={false}
        // Empêche de passer sous le sol : une vue par en dessous ne dit rien d'un meuble.
        maxPolarAngle={Math.PI / 2}
        dampingFactor={0.12}
      />
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
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        onSelect(part.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <boxGeometry
        args={[placement.sizeXMm * MM, placement.sizeYMm * MM, placement.sizeZMm * MM]}
      />
      <meshStandardMaterial
        color={selected ? SELECTED : (COLOURS[part.role] ?? '#c9a878')}
        roughness={0.72}
        metalness={0}
        // La pièce sélectionnée s'éclaire au lieu de changer de teinte : on la reconnaît
        // encore comme du bois, et l'ambre est celui de l'interface.
        emissive={selected ? SELECTED : '#000000'}
        emissiveIntensity={selected ? 0.18 : 0}
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
