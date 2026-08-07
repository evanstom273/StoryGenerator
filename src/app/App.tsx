import { StoryEngineProvider } from "./providers/StoryEngineProvider";
import { MediaLibraryProvider } from "./providers/MediaLibraryProvider";
import { GeminiTtsPlaybackProvider } from "./providers/GeminiTtsPlaybackProvider";
import { ChangelogProvider } from "./versioning/ChangelogContext";
import { ThemeProvider } from "./theming/ThemeContext";
import { AppBootstrap } from "./bootstrap/AppBootstrap";

export function App() {
  return (
    <ThemeProvider>
      <StoryEngineProvider>
        <MediaLibraryProvider>
          <GeminiTtsPlaybackProvider>
            <ChangelogProvider>
              <AppBootstrap />
            </ChangelogProvider>
          </GeminiTtsPlaybackProvider>
        </MediaLibraryProvider>
      </StoryEngineProvider>
    </ThemeProvider>
  );
}
