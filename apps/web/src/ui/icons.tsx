/**
 * Les icônes.
 *
 * Douze traits, écrits à la main, plutôt qu'une bibliothèque de deux mille pictogrammes
 * dont on en utiliserait douze. Elles héritent de la couleur du texte (`currentColor`) et
 * de sa taille (`1em`) : posées dans un bouton, elles s'alignent sans réglage.
 *
 * Une icône ne remplace jamais un libellé — elle l'accompagne. Un atelier ne devine pas
 * un pictogramme, et l'interface est déjà traduite.
 */

type IconProps = { className?: string };

function Svg({ children, className = '' }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export const DownloadIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 20h16" />
  </Svg>
);

export const SaveIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M9 4v5h6V4" />
    <path d="M8 20v-6h8v6" />
  </Svg>
);

export const TrashIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7v13h12V7" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);

export const CubeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </Svg>
);

export const RulerIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 9h18v6H3z" />
    <path d="M7 9v3M11 9v4M15 9v3M19 9v4" />
  </Svg>
);

export const PlanIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 4h16v16H4z" />
    <path d="M4 10h16M10 10v10" />
  </Svg>
);

export const ToolsIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 4a4 4 0 0 0 5 5l-9 9-4 2 2-4z" />
    <path d="m5 5 4 4" />
  </Svg>
);

export const WarningIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4 3 20h18z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const BackIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

export const SettingsIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Svg>
);

export const EyeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);

export const EyeOffIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 6 10 6a17 17 0 0 1-3.3 3.9" />
    <path d="M6.3 7.5A17 17 0 0 0 2 11s3.5 6 10 6a9.6 9.6 0 0 0 3.8-.8" />
  </Svg>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 6 8 12l6 6" />
  </Svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="m10 6 6 6-6 6" />
  </Svg>
);
