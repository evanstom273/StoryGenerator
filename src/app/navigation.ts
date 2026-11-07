import type { NavigationItem } from "../types/navigation";
import {
  CharactersIcon,
  HomeIcon,
  MemoryIcon,
  SettingsIcon,
  StoriesIcon,
  UniversesIcon,
} from "../components/icons";

export const navigationItems: NavigationItem[] = [
  {
    label: "Home",
    to: "/",
    description: "Launchpad for stories, characters, and universes.",
    icon: HomeIcon,
  },
  {
    label: "Stories",
    to: "/stories",
    description: "Create campaigns and manage living story timelines.",
    icon: StoriesIcon,
  },
  {
    label: "Player Characters",
    to: "/player-characters",
    description: "Create the original character the user will play.",
    icon: CharactersIcon,
  },
  {
    label: "Universes",
    to: "/universes",
    description: "Store world context, wiki links, and future imports.",
    icon: UniversesIcon,
  },
  {
    label: "Settings",
    to: "/settings",
    description: "Review the shell's theme, providers, and storage state.",
    icon: SettingsIcon,
  },
  {
    label: "Developer Notes",
    to: "/developer-notes",
    description: "Track bugs, feature requests, and testing discoveries.",
    icon: MemoryIcon,
  },
];
