import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { StoryEngineProvider } from "./providers/StoryEngineProvider";
import { GeminiTtsPlaybackProvider } from "./providers/GeminiTtsPlaybackProvider";
import { ChangelogProvider } from "./versioning/ChangelogContext";
import { ThemeProvider } from "./theming/ThemeContext";

export function App() {
  return (
    <ThemeProvider>
      <StoryEngineProvider>
        <GeminiTtsPlaybackProvider>
          <ChangelogProvider>
            <RouterProvider router={router} />
          </ChangelogProvider>
        </GeminiTtsPlaybackProvider>
      </StoryEngineProvider>
    </ThemeProvider>
  );
}
