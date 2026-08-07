import { createBrowserRouter } from "react-router-dom";
import { V2Shell } from "./layout/V2Shell";
import { HomePage } from "../pages/HomePage";
import { MediaLibraryPage } from "../pages/MediaLibraryPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PlayerCharacterDetailPage } from "../pages/PlayerCharacterDetailPage";
import { PlayerCharacterFormPage } from "../pages/PlayerCharacterFormPage";
import { PlayerCharactersPage } from "../pages/PlayerCharactersPage";
import { DeveloperBugsPage } from "../pages/DeveloperBugsPage";
import { DeveloperBugFormPage } from "../pages/DeveloperBugFormPage";
import { DeveloperFeatureRequestFormPage } from "../pages/DeveloperFeatureRequestFormPage";
import { DeveloperFeatureRequestsPage } from "../pages/DeveloperFeatureRequestsPage";
import { DeveloperNotesExportPage } from "../pages/DeveloperNotesExportPage";
import { DeveloperNotesPage } from "../pages/DeveloperNotesPage";
import { DeveloperTestingNoteFormPage } from "../pages/DeveloperTestingNoteFormPage";
import { DeveloperTestingNotesPage } from "../pages/DeveloperTestingNotesPage";
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
    element: <V2Shell />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "media-library",
        element: <MediaLibraryPage />,
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
        path: "developer-notes",
        element: <DeveloperNotesPage />,
      },
      {
        path: "developer-notes/bugs",
        element: <DeveloperBugsPage />,
      },
      {
        path: "developer-notes/bugs/new",
        element: <DeveloperBugFormPage />,
      },
      {
        path: "developer-notes/bugs/:bugId/edit",
        element: <DeveloperBugFormPage />,
      },
      {
        path: "developer-notes/features",
        element: <DeveloperFeatureRequestsPage />,
      },
      {
        path: "developer-notes/features/new",
        element: <DeveloperFeatureRequestFormPage />,
      },
      {
        path: "developer-notes/features/:featureId/edit",
        element: <DeveloperFeatureRequestFormPage />,
      },
      {
        path: "developer-notes/testing",
        element: <DeveloperTestingNotesPage />,
      },
      {
        path: "developer-notes/testing/new",
        element: <DeveloperTestingNoteFormPage />,
      },
      {
        path: "developer-notes/testing/:noteId/edit",
        element: <DeveloperTestingNoteFormPage />,
      },
      {
        path: "developer-notes/export",
        element: <DeveloperNotesExportPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
