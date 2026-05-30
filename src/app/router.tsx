import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlayerCharacterDetailPage } from "../pages/PlayerCharacterDetailPage";
import { PlayerCharacterFormPage } from "../pages/PlayerCharacterFormPage";
import { PlayerCharactersPage } from "../pages/PlayerCharactersPage";
import { SettingsPage } from "../pages/SettingsPage";
import { StoryCreatePage } from "../pages/StoryCreatePage";
import { StoriesPage } from "../pages/StoriesPage";
import { StoryWorkspacePage } from "../pages/StoryWorkspacePage";
import { UniverseDetailPage } from "../pages/UniverseDetailPage";
import { UniverseFormPage } from "../pages/UniverseFormPage";
import { UniversesPage } from "../pages/UniversesPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "stories",
        element: <StoriesPage />,
      },
      {
        path: "stories/new",
        element: <StoryCreatePage />,
      },
      {
        path: "stories/:storyId",
        element: <StoryWorkspacePage />,
      },
      {
        path: "player-characters",
        element: <PlayerCharactersPage />,
      },
      {
        path: "player-characters/new",
        element: <PlayerCharacterFormPage />,
      },
      {
        path: "player-characters/:characterId",
        element: <PlayerCharacterDetailPage />,
      },
      {
        path: "player-characters/:characterId/edit",
        element: <PlayerCharacterFormPage />,
      },
      {
        path: "universes",
        element: <UniversesPage />,
      },
      {
        path: "universes/new",
        element: <UniverseFormPage />,
      },
      {
        path: "universes/import",
        element: <UniverseFormPage />,
      },
      {
        path: "universes/:universeId",
        element: <UniverseDetailPage />,
      },
      {
        path: "universes/:universeId/edit",
        element: <UniverseFormPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
