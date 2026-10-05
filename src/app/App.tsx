import { StoryEngineProvider } from "./providers/StoryEngineProvider";
import { ChangelogProvider } from "./versioning/ChangelogContext";
import { ThemeProvider } from "./theming/ThemeContext";
import { AppBootstrap } from "./bootstrap/AppBootstrap";

export function App() {
  return (
    <ThemeProvider>
      <StoryEngineProvider>
        <ChangelogProvider>
          <AppBootstrap />
        </ChangelogProvider>
      </StoryEngineProvider>
    </ThemeProvider>
  );
}
