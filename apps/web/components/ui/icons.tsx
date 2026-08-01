import type { ComponentType, SVGProps } from "react";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

function IconFrame({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LayoutIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <rect height="7" rx="1" width="7" x="3" y="3" />
    <rect height="5" rx="1" width="7" x="14" y="3" />
    <rect height="9" rx="1" width="7" x="14" y="12" />
    <rect height="5" rx="1" width="7" x="3" y="16" />
  </IconFrame>
);

export const MoneyIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .9-3 2s1.1 1.8 3 2c1.9.2 3 1 3 2.1S13.7 16 12 16c-1.2 0-2.4-.4-3.2-1.2M12 5.5v13" />
  </IconFrame>
);

export const TeamIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.5-3.4 2.3-5 5.5-5s5 1.6 5.5 5M16 6.5a3 3 0 0 1 0 5.8M16.5 14c2.4.4 3.7 2 4 5" />
  </IconFrame>
);

export const SettingsIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
  </IconFrame>
);

export const BuildingIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="M4 21V5l8-2v18M12 8h8v13M2 21h20" />
    <path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" />
  </IconFrame>
);

export const DownloadIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />
  </IconFrame>
);

export const LogoutIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />
  </IconFrame>
);

export const TableIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <rect height="6" rx="1" width="16" x="4" y="7" />
    <path d="M7 13v7M17 13v7M4 10H2M22 10h-2" />
  </IconFrame>
);

export const PlusIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="M12 5v14M5 12h14" />
  </IconFrame>
);

export const PrintIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </IconFrame>
);

export const QrIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-6v-2M18 18h2" />
  </IconFrame>
);

export const PeopleIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19c.5-3.4 2.3-5 5.5-5s5 1.6 5.5 5M16 7a2.5 2.5 0 0 1 0 5M16 15c2.3.3 3.7 1.7 4 4" />
  </IconFrame>
);

export const CloseIcon: IconComponent = (props) => (
  <IconFrame {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </IconFrame>
);
