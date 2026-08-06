import { StoryEngineProvider } from "./providers/StoryEngineProvider";
import { GeminiTtsPlaybackProvider } from "./providers/GeminiTtsPlaybackProvider";
import { ChangelogProvider } from "./versioning/ChangelogContext";
import { ThemeProvider } from "./theming/ThemeContext";
import { AppBootstrap } from "./bootstrap/AppBootstrap";

export function App() {
  return (
    <ThemeProvider>
      <StoryEngineProvider>
        <GeminiTtsPlaybackProvider>
          <ChangelogProvider>
            <AppBootstrap />
          </ChangelogProvider>
        </GeminiTtsPlaybackProvider>
      </StoryEngineProvider>
    </ThemeProvider>
  );
}
