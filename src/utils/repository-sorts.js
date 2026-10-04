export const REPOSITORY_SORTS = Object.freeze(
  [
    { value: "trending", label: "Trending", homepageTitle: "🔥 Trending" },
    {
      value: "recent",
      label: "Recently Created",
      homepageTitle: "🆕 Recently Created",
    },
    {
      value: "updated",
      label: "Recently Updated",
      homepageTitle: "🕒 Recently Updated",
    },
    {
      value: "downloads",
      label: "Most Downloads",
      homepageTitle: "⬇️ Most Downloaded",
    },
    { value: "likes", label: "Most Likes", homepageTitle: "❤️ Most Liked" },
  ].map(Object.freeze),
);

export const REPOSITORY_SORT_VALUES = Object.freeze(
  REPOSITORY_SORTS.map(({ value }) => value),
);

export function getRepositorySort(value) {
  return (
    REPOSITORY_SORTS.find((sort) => sort.value === value) || REPOSITORY_SORTS[0]
  );
}
