export const REPOSITORY_TYPES = Object.freeze([
  {
    type: "model",
    label: "Model",
    plural: "Models",
    icon: "i-carbon-model",
    tagType: "info",
    discoveryDescription: "Discover and share machine learning models",
    creationDescription:
      "Store and share machine learning models with the community",
  },
  {
    type: "dataset",
    label: "Dataset",
    plural: "Datasets",
    icon: "i-carbon-data-table",
    tagType: "success",
    discoveryDescription: "Discover and share datasets for machine learning",
    creationDescription: "Store and share datasets for training and evaluation",
  },
  {
    type: "space",
    label: "Space",
    plural: "Spaces",
    icon: "i-carbon-application",
    tagType: "warning",
    discoveryDescription: "Discover ML demos and applications",
    creationDescription: "Create interactive ML demos and applications",
  },
]);

export function isRepositoryType(type) {
  return REPOSITORY_TYPES.some((item) => item.type === type);
}

export function getRepositoryType(type) {
  return (
    REPOSITORY_TYPES.find((item) => item.type === type) || REPOSITORY_TYPES[0]
  );
}
