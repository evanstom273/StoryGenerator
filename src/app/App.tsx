import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { StoryEngineProvider } from "./providers/StoryEngineProvider";
import { ChangelogProvider } from "./versioning/ChangelogContext";
import { ThemeProvider } from "./theming/ThemeContext";

export function App() {
  return (
    <ThemeProvider>
      <StoryEngineProvider>
        <ChangelogProvider>
          <RouterProvider router={router} />
        </ChangelogProvider>
      </StoryEngineProvider>
    </ThemeProvider>
  );
}
