import { MetaChatProvider } from "../features/metachat/MetaChatProvider";
import { StoryEngineProvider } from "./providers/StoryEngineProvider";
import { ChangelogProvider } from "./versioning/ChangelogContext";
import { ThemeProvider } from "./theming/ThemeContext";
import { AppBootstrap } from "./bootstrap/AppBootstrap";

export function App() {
  return (
    <ThemeProvider>
      <StoryEngineProvider>
        <MetaChatProvider>
          <ChangelogProvider>
            <AppBootstrap />
          </ChangelogProvider>
        </MetaChatProvider>
      </StoryEngineProvider>
    </ThemeProvider>
  );
}
