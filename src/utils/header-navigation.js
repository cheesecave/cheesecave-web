import { REPOSITORY_TYPES } from "@/utils/repository-types";

const repositoryIconColors = {
  model: "text-blue-500",
  dataset: "text-green-500",
  space: "text-purple-500",
};

function repositoryIcon(repository) {
  return `${repository.icon} ${repositoryIconColors[repository.type] || ""}`.trim();
}

const repositoryEntries = REPOSITORY_TYPES.map((repository) => ({
  id: repository.type,
  label: repository.plural,
  icon: repositoryIcon(repository),
  to: `/${repository.type}s`,
}));

const organizationEntry = {
  id: "organization",
  label: "Organizations",
  icon: "i-carbon-group text-orange-500",
  to: "/organizations",
};

const collectionEntry = {
  id: "collection",
  label: "Collections",
  icon: "i-carbon-folder text-amber-500",
  to: "/collections",
};

export const HEADER_NAVIGATION_ITEMS = [
  ...repositoryEntries,
  collectionEntry,
  organizationEntry,
];

export const HEADER_CREATION_ITEMS = [
  ...REPOSITORY_TYPES.map((repository) => ({
    id: repository.type,
    label: `New ${repository.label}`,
    icon: repositoryIcon(repository),
    to: `/new?type=${repository.type}`,
  })),
  // opens the dialog of a new collection on the page of all of them (a link, like the others)
  {
    ...collectionEntry,
    label: "New Collection",
    to: "/collections?new=1",
  },
  {
    ...organizationEntry,
    label: "New Organization",
    to: "/organizations/new",
    divided: true,
  },
];

export function getHeaderAccountItems(username) {
  return [
    {
      id: "profile",
      label: "Profile",
      icon: "i-carbon-user",
      to: `/${username}`,
    },
    {
      id: "settings",
      label: "Settings",
      icon: "i-carbon-settings",
      to: "/settings",
    },
    {
      id: "logout",
      label: "Logout",
      icon: "i-carbon-logout",
      action: "logout",
      divided: true,
      danger: true,
    },
  ];
}
